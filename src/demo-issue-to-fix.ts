/**
 * Demo script to test the Issue-to-Fix Workflow Agent
 * Run with: pnpm tsx --env-file=.env src/demo-issue-to-fix.ts
 */

import { runIssueToFixWorkflow } from "./agents/issue-to-fix-agent.js";

// Realistic issue for the auto-remediator codebase
const issueInput = {
  owner: "RealPage",
  repo: "agent-leasing",
  title: "Add retry logic to GitHubMCPClient connection",
  description: `## Problem
The \`GitHubMCPClient.connect()\` method in \`src/mcp/github-mcp-client.ts\` does not handle transient connection failures gracefully. If the GitHub MCP server is temporarily unavailable, the connection fails immediately without retry.

## Expected Behavior
The client should retry connection with exponential backoff (e.g., 3 attempts with 1s, 2s, 4s delays) before throwing an error.

## Current Behavior
Single connection attempt that fails immediately on any error.

## Suggested Fix
Add a retry wrapper around the \`this.client.connect(this.transport)\` call in the \`connect()\` method with configurable retry options.

## Files to Modify
- \`src/mcp/github-mcp-client.ts\`

## Acceptance Criteria
- [ ] Connection retries up to 3 times by default
- [ ] Exponential backoff between retries
- [ ] Retry count and delay should be configurable
- [ ] Clear error message after all retries exhausted`,
};

async function main(): Promise<void> {
  console.log("🚀 Starting Issue-to-Fix Workflow Agent\n");
  console.log("─".repeat(60));
  console.log("Input:");
  console.log(`  Owner:       ${issueInput.owner}`);
  console.log(`  Repo:        ${issueInput.repo}`);
  console.log(`  Title:       ${issueInput.title}`);
  console.log("  Description: (detailed - see issue)");
  console.log("─".repeat(60));
  console.log();

  try {
    const result = await runIssueToFixWorkflow(issueInput);

    console.log("📋 Workflow Result:");
    console.log("─".repeat(60));
    console.log(`Success:      ${result.success ? "✅ Yes" : "❌ No"}`);
    console.log(`Issue #:      ${result.issueNumber ?? "N/A"}`);
    console.log(`Issue URL:    ${result.issueUrl ?? "N/A"}`);
    console.log(`PR #:         ${result.prNumber ?? "N/A"}`);
    console.log(`PR URL:       ${result.prUrl ?? "N/A"}`);
    console.log();
    console.log("Summary:");
    console.log(`  ${result.summary}`);
    console.log("─".repeat(60));
  } catch (error) {
    console.error("❌ Workflow failed:", error);
    process.exit(1);
  }
}

main().catch(console.error);