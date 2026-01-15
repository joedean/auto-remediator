/**
 * Demo script to test GitHub MCP server integration
 * Run with: pnpm tsx --env-file=.env src/demo-github-mcp.ts
 */

import { createGitHubMCPClient } from "./mcp/github-mcp-client.js";

async function main(): Promise<void> {
  console.log("🔗 Connecting to GitHub MCP server...\n");

  const github = await createGitHubMCPClient();

  try {
    console.log("✅ Connected!\n");

    // List available prompts
    console.log("📋 Available prompts:");
    console.log("─".repeat(50));
    const prompts = await github.listPrompts();
    console.log(JSON.stringify(prompts, null, 2));
    console.log("─".repeat(50));

    // Get the issue_to_fix_workflow prompt
    console.log("\n📋 Getting issue_to_fix_workflow prompt:");
    console.log("─".repeat(50));
    const prompt = await github.getIssueToFixPrompt({
      owner: "RealPage",
      repo: "auto-remediator",
      title: "Fix login button",
      description: "Button does not trigger auth flow when clicked",
    });

    console.log(JSON.stringify(prompt, null, 2));
    console.log("─".repeat(50));
  } finally {
    console.log("\n🔌 Closing connection...");
    await github.close();
    console.log("✅ Done!");
  }
}

main().catch(console.error);