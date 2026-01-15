import { Agent, run } from "@openai/agents";
import { z } from "zod";
import {
  createElasticMCPServer,
  createElasticMCPClient,
  type UniqueErrorGroup,
} from "../mcp/elastic-mcp-client.js";
import {
  ErrorDiscoveryResultSchema,
  type ErrorDiscoveryInput,
  type ErrorDiscoveryResult,
  type DiscoveredError,
} from "../types/remediation.js";

/**
 * System prompt for the error discovery agent
 */
const errorDiscoveryInstructions = `You are an error discovery agent that searches Elastic logs to find unique errors.

Your job is to:
1. Query the Elastic logs for errors from a specific service
2. Group errors by their unique signature (error type + file + function + line)
3. Return a deduplicated list of errors sorted by occurrence count

When searching, use ES|QL queries through the platform_core_execute_esql tool.

For finding unique errors, construct queries like:
\`\`\`
FROM logs-apm.app.{service_name}-default
| WHERE @timestamp > NOW() - {minutes} minute
| WHERE log.level == "ERROR"
| STATS count = COUNT(*), first_seen = MIN(@timestamp), last_seen = MAX(@timestamp), sample = MAX(message) BY message
| SORT count DESC
| LIMIT {limit}
\`\`\`

IMPORTANT ES|QL syntax rules:
- Time intervals use singular form: "5 minute", "1 hour", "24 hour" (NOT "minutes" or "hours")
- Replace dashes in service names with underscores for the index name (e.g., "renter-ai-agent" becomes "renter_ai_agent")

Extract from each error:
- Error type (e.g., IndexError, TypeError, KeyError)
- File path and line number from stack traces
- Function name where the error occurred
- A clear description of what went wrong

Be thorough but concise. Focus on actionable error information.`;

/**
 * Schema for a single error in the agent output
 */
const AgentErrorSchema = z.object({
  errorType: z.string(),
  errorMessage: z.string(),
  filePath: z.string().nullable(),
  functionName: z.string().nullable(),
  lineNumber: z.number().nullable(),
  count: z.number(),
  firstSeen: z.string(),
  lastSeen: z.string(),
  sampleStackTrace: z.string().nullable(),
});
type AgentError = z.infer<typeof AgentErrorSchema>;

/**
 * Output schema for the discovery agent
 */
const DiscoveryAgentOutputSchema = z.object({
  errors: z.array(AgentErrorSchema),
  totalCount: z.number(),
  queryExecuted: z.string().nullable(),
});

/**
 * Discover unique errors from Elastic logs using the MCP server
 */
export async function discoverErrors(
  input: ErrorDiscoveryInput
): Promise<ErrorDiscoveryResult> {
  const elasticMcp = createElasticMCPServer();

  try {
    await elasticMcp.connect();

    const discoveryAgent = new Agent({
      name: "Error Discovery Agent",
      instructions: errorDiscoveryInstructions,
      model: "gpt-4o",
      mcpServers: [elasticMcp],
      outputType: DiscoveryAgentOutputSchema,
    });

    const prompt = buildDiscoveryPrompt(input);
    const result = await run(discoveryAgent, prompt);

    if (!result.finalOutput) {
      return {
        serviceName: input.serviceName,
        timeRangeMinutes: input.timeRangeMinutes,
        totalErrorCount: 0,
        uniqueErrorCount: 0,
        errors: [],
        queryExecuted: null,
      };
    }

    const output = result.finalOutput;
    const errors = output.errors.map((e) => transformToDiscoveredError(e, input.serviceName));

    return {
      serviceName: input.serviceName,
      timeRangeMinutes: input.timeRangeMinutes,
      totalErrorCount: output.totalCount,
      uniqueErrorCount: errors.length,
      errors: errors.slice(0, input.maxErrors),
      queryExecuted: output.queryExecuted,
    };
  } finally {
    await elasticMcp.close();
  }
}

/**
 * Discover errors using the MCP client directly (without agent)
 * This is useful for simpler use cases or testing
 */
export async function discoverErrorsDirect(
  input: ErrorDiscoveryInput
): Promise<ErrorDiscoveryResult> {
  const client = await createElasticMCPClient();

  try {
    const uniqueErrors = await client.getUniqueErrors({
      serviceName: input.serviceName,
      index: input.index,
      timeRangeMinutes: input.timeRangeMinutes,
      limit: input.maxErrors,
    });

    const errors = uniqueErrors.map((e) => transformUniqueErrorGroup(e));
    const totalCount = errors.reduce((sum, e) => sum + e.occurrenceCount, 0);

    return {
      serviceName: input.serviceName,
      timeRangeMinutes: input.timeRangeMinutes,
      totalErrorCount: totalCount,
      uniqueErrorCount: errors.length,
      errors,
      queryExecuted: null,
    };
  } finally {
    await client.close();
  }
}

/**
 * Build the prompt for the discovery agent
 */
function buildDiscoveryPrompt(input: ErrorDiscoveryInput): string {
  const indexInfo = input.index
    ? `Use index: ${input.index}`
    : `Use index: logs-apm.app.${input.serviceName.replace(/-/g, "_")}-default`;

  return `Find unique errors from the "${input.serviceName}" service in the last ${input.timeRangeMinutes} minutes.

${indexInfo}

Requirements:
1. Search for ERROR level logs using ES|QL
2. Group by unique error pattern (same error type + location)
3. Return up to ${input.maxErrors} unique errors
4. Sort by occurrence count (most frequent first)
5. Use proper ES|QL time interval syntax: "${input.timeRangeMinutes} minute" (singular)

Extract for each error:
- Error type (e.g., IndexError, TypeError)
- Error message (the core issue, not variable-specific parts)
- File path and line number from stack trace
- Function name
- Count of occurrences
- First and last seen timestamps
- A sample stack trace

Return the results in the structured format.`;
}

/**
 * Transform agent output to DiscoveredError
 */
function transformToDiscoveredError(
  error: AgentError,
  serviceName: string
): DiscoveredError {
  const signature = generateSignature(error, serviceName);

  return {
    errorSignature: signature,
    errorType: error.errorType,
    errorMessage: error.errorMessage,
    filePath: error.filePath,
    functionName: error.functionName,
    lineNumber: error.lineNumber,
    occurrenceCount: error.count,
    firstOccurrence: error.firstSeen,
    lastOccurrence: error.lastSeen,
    sampleStackTrace: error.sampleStackTrace,
  };
}

/**
 * Transform UniqueErrorGroup to DiscoveredError
 */
function transformUniqueErrorGroup(group: UniqueErrorGroup): DiscoveredError {
  return {
    errorSignature: group.errorSignature,
    errorType: group.errorType,
    errorMessage: group.errorMessage,
    filePath: group.filePath || null,
    functionName: group.functionName || null,
    lineNumber: group.lineNumber || null,
    occurrenceCount: group.count,
    firstOccurrence: group.firstSeen,
    lastOccurrence: group.lastSeen,
    sampleStackTrace: group.sampleStackTrace || null,
  };
}

/**
 * Generate a unique signature for an error
 */
function generateSignature(
  error: {
    errorType: string;
    filePath: string | null;
    functionName: string | null;
    lineNumber: number | null;
  },
  serviceName: string
): string {
  const parts = [serviceName, error.errorType];
  if (error.filePath) parts.push(error.filePath);
  if (error.functionName) parts.push(error.functionName);
  if (error.lineNumber) parts.push(String(error.lineNumber));
  return parts.join("::");
}

export { ErrorDiscoveryResultSchema };
