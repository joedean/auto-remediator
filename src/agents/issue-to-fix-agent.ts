import { Agent, run } from "@openai/agents";
import { z } from "zod";
import {
  createGitHubMCPClient,
  createGitHubMCPServer,
  type IssueToFixInput,
  IssueToFixInputSchema,
} from "../mcp/github-mcp-client.js";

/**
 * Result from the issue-to-fix workflow agent
 */
export const IssueToFixResultSchema = z.object({
  issueNumber: z.number().nullable().describe("Created issue number"),
  issueUrl: z.string().nullable().describe("URL to the created issue"),
  prNumber: z.number().nullable().describe("Created PR number if available"),
  prUrl: z.string().nullable().describe("URL to the created PR if available"),
  summary: z.string().describe("Summary of actions taken"),
  success: z.boolean().describe("Whether the workflow completed successfully"),
});
export type IssueToFixResult = z.infer<typeof IssueToFixResultSchema>;

/**
 * Run the issue-to-fix workflow using an OpenAI agent with GitHub MCP tools
 */
export async function runIssueToFixWorkflow(
  input: IssueToFixInput
): Promise<IssueToFixResult> {
  // Validate input
  const validatedInput = IssueToFixInputSchema.parse(input);

  // Get the prompt from the GitHub MCP server
  const mcpClient = await createGitHubMCPClient();
  const promptResult = await mcpClient.getIssueToFixPrompt(validatedInput);
  await mcpClient.close();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages = (promptResult as any)?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("Failed to get prompt from GitHub MCP server");
  }

  // Convert MCP messages to instructions string
  const instructions = messages
    .map((msg: { content?: { text?: string } }) => msg.content?.text)
    .filter(Boolean)
    .join("\n\n");

  // Create the MCP server for the agent
  const githubMcp = createGitHubMCPServer();
  await githubMcp.connect();

  try {
    // Create the agent with MCP prompt as instructions
    const issueToFixAgent = new Agent({
      name: "Issue to Fix Workflow Agent",
      instructions,
      model: "gpt-4o",
      mcpServers: [githubMcp],
      outputType: IssueToFixResultSchema,
    });

    const result = await run(issueToFixAgent, "Execute the workflow.");

    if (!result.finalOutput) {
      return {
        issueNumber: null,
        issueUrl: null,
        prNumber: null,
        prUrl: null,
        summary: "Agent did not return a structured output",
        success: false,
      };
    }

    return result.finalOutput;
  } finally {
    await githubMcp.close();
  }
}

export { IssueToFixInputSchema, type IssueToFixInput };
