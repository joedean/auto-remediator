import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { MCPServerStdio } from "@openai/agents";
import { z } from "zod";

export function getGitHubToken(): string {
  const token = process.env["GITHUB_PERSONAL_ACCESS_TOKEN"];
  if (!token) {
    throw new Error(
      "GITHUB_PERSONAL_ACCESS_TOKEN environment variable is required"
    );
  }
  return token;
}

export function getGitHubMCPServerPath(): string {
  const path = process.env["GITHUB_MCP_SERVER_PATH"];
  if (!path) {
    throw new Error(
      "GITHUB_MCP_SERVER_PATH environment variable is required"
    );
  }
  // Expand ~ to home directory
  if (path.startsWith("~")) {
    return path.replace("~", process.env["HOME"] || "");
  }
  return path;
}

/**
 * Input for the issue_to_fix_workflow prompt
 */
export const IssueToFixInputSchema = z.object({
  owner: z.string().describe("GitHub repository owner (user or organization)"),
  repo: z.string().describe("GitHub repository name"),
  title: z.string().describe("Issue title describing the problem"),
  description: z.string().describe("Detailed description of the issue to fix"),
});
export type IssueToFixInput = z.infer<typeof IssueToFixInputSchema>;

/**
 * Options for connecting to the GitHub MCP server
 */
export interface ConnectionOptions {
  /**
   * Maximum number of retry attempts (default: 3)
   */
  maxRetries?: number;
  /**
   * Base delay in milliseconds for exponential backoff (default: 1000)
   */
  retryDelayMs?: number;
}

/**
 * Create an MCPServerStdio instance for use with OpenAI Agent SDK
 */
export function createGitHubMCPServer(): MCPServerStdio {
  return new MCPServerStdio({
    command: getGitHubMCPServerPath(),
    args: ["stdio"],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: getGitHubToken(),
      GITHUB_TOOLSETS: "all",
    },
  });
}

/**
 * GitHub MCP Client that provides access to prompts and tools
 */
export class GitHubMCPClient {
  private client: Client;
  private transport: StdioClientTransport;

  constructor() {
    this.transport = new StdioClientTransport({
      command: getGitHubMCPServerPath(),
      args: ["stdio"],
      env: {
        ...process.env,
        GITHUB_PERSONAL_ACCESS_TOKEN: getGitHubToken(),
        GITHUB_TOOLSETS: "all",
      },
    });

    this.client = new Client({
      name: "auto-remediator",
      version: "0.1.0",
    });
  }

  /**
   * Check if an error is transient and should be retried
   */
  private isTransientError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      // Check for common transient error codes and messages
      return (
        message.includes("econnrefused") ||
        message.includes("econnreset") ||
        message.includes("etimedout") ||
        message.includes("network") ||
        message.includes("socket") ||
        message.includes("timeout") ||
        message.includes("rate limit")
      );
    }
    return false;
  }

  /**
   * Sleep for a specified number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Connect to the GitHub MCP server with retry logic
   */
  async connect(options?: ConnectionOptions): Promise<void> {
    const maxRetries = options?.maxRetries ?? 3;
    const baseDelay = options?.retryDelayMs ?? 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.client.connect(this.transport);
        return;
      } catch (error) {
        if (!this.isTransientError(error) || attempt === maxRetries) {
          throw error;
        }
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }
  }

  /**
   * Close the connection to the GitHub MCP server
   */
  async close(): Promise<void> {
    await this.client.close();
  }

  /**
   * List available prompts from the GitHub MCP server
   */
  async listPrompts(): Promise<unknown> {
    const result = await this.client.listPrompts();
    return result.prompts;
  }

  /**
   * Get a specific prompt with arguments
   */
  async getPrompt(
    name: string,
    args: Record<string, string>
  ): Promise<unknown> {
    const result = await this.client.getPrompt({ name, arguments: args });
    return result;
  }

  /**
   * Get the issue_to_fix_workflow prompt
   */
  async getIssueToFixPrompt(input: IssueToFixInput): Promise<unknown> {
    return this.getPrompt("issue_to_fix_workflow", {
      owner: input.owner,
      repo: input.repo,
      title: input.title,
      description: input.description,
    });
  }

  /**
   * List available tools from the GitHub MCP server
   */
  async listTools(): Promise<unknown> {
    const result = await this.client.listTools();
    return result.tools;
  }

  /**
   * Call a tool on the GitHub MCP server
   */
  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const result = await this.client.callTool({ name, arguments: args });
    return result;
  }
}

/**
 * Create and connect to the GitHub MCP server
 */
export async function createGitHubMCPClient(
  options?: ConnectionOptions
): Promise<GitHubMCPClient> {
  const client = new GitHubMCPClient();
  await client.connect(options);
  return client;
}
