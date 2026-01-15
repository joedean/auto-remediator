import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { MCPServerStdio } from "@openai/agents";
import { z } from "zod";

/**
 * Elastic MCP server configuration from .mcp.json
 */
export interface ElasticMCPConfig {
  url: string;
  apiKey: string;
}

/**
 * Get Elastic MCP configuration from environment or defaults
 */
export function getElasticMCPConfig(): ElasticMCPConfig {
  const url =
    process.env["ELASTIC_MCP_URL"] ||
    "https://rp-central-log.kb.us-east-2.aws.elastic-cloud.com/s/renter-ai/api/agent_builder/mcp";
  const apiKey =
    process.env["ELASTIC_MCP_API_KEY"] ||
    "R1doY0lwc0JMd1RFRUY5TzZ5ZG46YUNUbkFQNGdKQURiRC1nc3BlWnpaUQ==";

  return { url, apiKey };
}

/**
 * Schema for search query input
 */
export const ElasticSearchInputSchema = z.object({
  query: z.string().describe("Natural language query for searching logs"),
  index: z.string().optional().describe("Optional index to search against"),
});
export type ElasticSearchInput = z.infer<typeof ElasticSearchInputSchema>;

/**
 * Schema for ES|QL query input
 */
export const ESQLQueryInputSchema = z.object({
  query: z.string().describe("ES|QL query to execute"),
});
export type ESQLQueryInput = z.infer<typeof ESQLQueryInputSchema>;

/**
 * Schema for unique errors query
 */
export const UniqueErrorsInputSchema = z.object({
  serviceName: z.string().describe("Service name to filter errors"),
  index: z
    .string()
    .optional()
    .describe("Optional index override (defaults to logs-apm.app.{service_name}-default)"),
  timeRangeMinutes: z
    .number()
    .default(15)
    .describe("Time range in minutes (e.g., 15, 60, 1440)"),
  limit: z.number().default(100).describe("Maximum number of unique errors"),
});
export type UniqueErrorsInput = z.infer<typeof UniqueErrorsInputSchema>;

/**
 * Schema for a single error from Elastic
 */
export const ElasticErrorSchema = z.object({
  timestamp: z.string(),
  serviceName: z.string(),
  logLevel: z.string(),
  message: z.string(),
  errorType: z.string().optional(),
  stackTrace: z.string().optional(),
  filePath: z.string().optional(),
  functionName: z.string().optional(),
  lineNumber: z.number().optional(),
  count: z.number().optional(),
});
export type ElasticError = z.infer<typeof ElasticErrorSchema>;

/**
 * Schema for grouped unique errors
 */
export const UniqueErrorGroupSchema = z.object({
  errorSignature: z.string().describe("Unique signature identifying this error type"),
  errorMessage: z.string().describe("The error message pattern"),
  errorType: z.string().describe("Type of error (e.g., IndexError, TypeError)"),
  filePath: z.string().optional().describe("File where error originates"),
  functionName: z.string().optional().describe("Function where error originates"),
  lineNumber: z.number().optional().describe("Line number of error"),
  count: z.number().describe("Number of occurrences"),
  firstSeen: z.string().describe("First occurrence timestamp"),
  lastSeen: z.string().describe("Most recent occurrence timestamp"),
  sampleMessage: z.string().describe("Sample full error message"),
  sampleStackTrace: z.string().optional().describe("Sample stack trace"),
});
export type UniqueErrorGroup = z.infer<typeof UniqueErrorGroupSchema>;

/**
 * Create an MCPServerStdio instance for use with OpenAI Agent SDK
 */
export function createElasticMCPServer(): MCPServerStdio {
  const config = getElasticMCPConfig();

  return new MCPServerStdio({
    command: "npx",
    args: [
      "mcp-remote",
      config.url,
      "--header",
      `Authorization:ApiKey ${config.apiKey}`,
    ],
  });
}

/**
 * Elastic MCP Client that provides access to search and query tools
 */
export class ElasticMCPClient {
  private client: Client;
  private transport: StdioClientTransport;

  constructor() {
    const config = getElasticMCPConfig();

    this.transport = new StdioClientTransport({
      command: "npx",
      args: [
        "mcp-remote",
        config.url,
        "--header",
        `Authorization:ApiKey ${config.apiKey}`,
      ],
    });

    this.client = new Client({
      name: "auto-remediator-elastic",
      version: "0.1.0",
    });
  }

  /**
   * Connect to the Elastic MCP server
   */
  async connect(): Promise<void> {
    await this.client.connect(this.transport);
  }

  /**
   * Close the connection to the Elastic MCP server
   */
  async close(): Promise<void> {
    await this.client.close();
  }

  /**
   * List available tools from the Elastic MCP server
   */
  async listTools(): Promise<unknown> {
    const result = await this.client.listTools();
    return result.tools;
  }

  /**
   * Call a tool on the Elastic MCP server
   */
  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const result = await this.client.callTool({ name, arguments: args });
    return result;
  }

  /**
   * Search logs using natural language query
   */
  async search(input: ElasticSearchInput): Promise<unknown> {
    const args: Record<string, unknown> = { query: input.query };
    if (input.index) {
      args["index"] = input.index;
    }
    return this.callTool("platform_core_search", args);
  }

  /**
   * Execute an ES|QL query
   */
  async executeESSQL(query: string): Promise<unknown> {
    return this.callTool("platform_core_execute_esql", { query });
  }

  /**
   * Generate an ES|QL query from natural language
   */
  async generateESSQL(
    query: string,
    index?: string,
    context?: string
  ): Promise<unknown> {
    const args: Record<string, unknown> = { query };
    if (index) args["index"] = index;
    if (context) args["context"] = context;
    return this.callTool("platform_core_generate_esql", args);
  }

  /**
   * Get unique errors grouped by error type from a service
   */
  async getUniqueErrors(input: UniqueErrorsInput): Promise<UniqueErrorGroup[]> {
    // Use provided index or derive from service name
    const indexName = input.index ||
      `logs-apm.app.${input.serviceName.replace(/-/g, "_")}-default`;

    // Build ES|QL query with proper time interval syntax
    const query = `
FROM ${indexName}
| WHERE @timestamp > NOW() - ${input.timeRangeMinutes} minute
| WHERE log.level == "ERROR"
| STATS count = COUNT(*),
        first_seen = MIN(@timestamp),
        last_seen = MAX(@timestamp),
        sample_message = MAX(message)
  BY message
| SORT count DESC
| LIMIT ${input.limit}
    `.trim();

    const result = await this.executeESSQL(query);
    return this.parseUniqueErrorsResult(result, input.serviceName);
  }

  /**
   * Parse the ES|QL result into UniqueErrorGroup objects
   */
  private parseUniqueErrorsResult(
    result: unknown,
    serviceName: string
  ): UniqueErrorGroup[] {
    const errors: UniqueErrorGroup[] = [];

    // Handle the MCP tool result structure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = (result as any)?.content;
    if (!Array.isArray(content)) {
      return errors;
    }

    for (const item of content) {
      if (item.type === "text" && item.text) {
        try {
          const parsed = JSON.parse(item.text);
          // Handle tabular data format
          if (parsed.columns && parsed.values) {
            for (const row of parsed.values) {
              const errorGroup = this.parseErrorRow(row, parsed.columns, serviceName);
              if (errorGroup) {
                errors.push(errorGroup);
              }
            }
          }
        } catch {
          // Try to parse as direct values
        }
      }
    }

    return errors;
  }

  /**
   * Parse a single row from ES|QL results
   */
  private parseErrorRow(
    row: unknown[],
    columns: { name: string }[],
    serviceName: string
  ): UniqueErrorGroup | null {
    const getValue = (columnName: string): unknown => {
      const idx = columns.findIndex((c) => c.name === columnName);
      return idx >= 0 ? row[idx] : undefined;
    };

    const message = getValue("message") || getValue("sample_message");
    if (typeof message !== "string") return null;

    // Extract error details from the message
    const errorDetails = this.extractErrorDetails(message);

    return {
      errorSignature: this.generateErrorSignature(errorDetails, serviceName),
      errorMessage: errorDetails.errorMessage,
      errorType: errorDetails.errorType,
      filePath: errorDetails.filePath,
      functionName: errorDetails.functionName,
      lineNumber: errorDetails.lineNumber,
      count: (getValue("count") as number) || 1,
      firstSeen: (getValue("first_seen") as string) || new Date().toISOString(),
      lastSeen: (getValue("last_seen") as string) || new Date().toISOString(),
      sampleMessage: message,
      sampleStackTrace: errorDetails.stackTrace,
    };
  }

  /**
   * Extract structured error details from a message
   */
  private extractErrorDetails(message: string): {
    errorMessage: string;
    errorType: string;
    filePath?: string;
    functionName?: string;
    lineNumber?: number;
    stackTrace?: string;
  } {
    // Try to parse as JSON (common log format)
    try {
      const parsed = JSON.parse(message);
      const errorMessage = parsed.message || message;
      const exception = parsed.exception || "";

      // Extract error type from exception
      const errorTypeMatch = exception.match(/(\w+Error):/);
      const errorType = errorTypeMatch ? errorTypeMatch[1] : "UnknownError";

      // Extract file path and line number from stack trace
      const fileMatch = exception.match(/File "([^"]+)", line (\d+), in (\w+)/);

      return {
        errorMessage,
        errorType,
        filePath: fileMatch ? fileMatch[1] : undefined,
        functionName: fileMatch ? fileMatch[3] : undefined,
        lineNumber: fileMatch ? parseInt(fileMatch[2], 10) : undefined,
        stackTrace: exception || undefined,
      };
    } catch {
      // Not JSON, try to extract from plain text
      const errorTypeMatch = message.match(/(\w+Error):/);
      return {
        errorMessage: message,
        errorType: errorTypeMatch?.[1] ?? "UnknownError",
      };
    }
  }

  /**
   * Generate a unique signature for error grouping
   */
  private generateErrorSignature(
    details: {
      errorType: string;
      filePath?: string;
      functionName?: string;
      lineNumber?: number;
    },
    serviceName: string
  ): string {
    const parts = [serviceName, details.errorType];
    if (details.filePath) parts.push(details.filePath);
    if (details.functionName) parts.push(details.functionName);
    if (details.lineNumber) parts.push(String(details.lineNumber));
    return parts.join("::");
  }
}

/**
 * Create and connect to the Elastic MCP server
 */
export async function createElasticMCPClient(): Promise<ElasticMCPClient> {
  const client = new ElasticMCPClient();
  await client.connect();
  return client;
}
