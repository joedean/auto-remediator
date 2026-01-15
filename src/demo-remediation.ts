/**
 * Demo script for the full auto-remediation workflow
 *
 * This demonstrates:
 * 1. Discovering unique errors from Elastic logs
 * 2. Triaging and analyzing root causes
 * 3. Creating GitHub issues with fix suggestions
 * 4. Assigning Copilot to create PRs
 *
 * Usage:
 *   pnpm tsx src/demo-remediation.ts
 *
 * Environment variables:
 *   OPENAI_API_KEY - Required for AI agents
 *   GITHUB_PERSONAL_ACCESS_TOKEN - Required for GitHub operations
 *   GITHUB_MCP_SERVER_PATH - Path to GitHub MCP server
 *   ELASTIC_MCP_URL - Optional, defaults to rp-central-log
 *   ELASTIC_MCP_API_KEY - Optional, defaults to configured key
 */

import { runRemediationWorkflow } from "./agents/remediation-workflow.js";
import { discoverErrors } from "./agents/error-discovery-agent.js";
import { triageAndAnalyze, formatRootCauseForIssue } from "./agents/root-cause-agent.js";

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Auto-Remediation Workflow Demo");
  console.log("=".repeat(60));
  console.log("");

  // Configuration
  const config = {
    serviceName: "renter-ai-agent",
    index: "logs-apm.app.renter_ai_agent-default", // Explicit index for the service
    timeRangeMinutes: 15, // Time range in minutes
    owner: "RealPage", // Update with your GitHub org
    repo: "renter-ai-agent", // Update with your repo
    maxIssues: 3,
    dryRun: true, // Set to false to actually create issues
  };

  console.log("Configuration:");
  console.log(`  Service: ${config.serviceName}`);
  console.log(`  Index: ${config.index}`);
  console.log(`  Time Range: ${config.timeRangeMinutes} minutes`);
  console.log(`  GitHub Repo: ${config.owner}/${config.repo}`);
  console.log(`  Max Issues: ${config.maxIssues}`);
  console.log(`  Dry Run: ${config.dryRun}`);
  console.log("");

  // Option 1: Run the full workflow
  if (process.argv.includes("--full")) {
    console.log("-".repeat(60));
    console.log("Running full remediation workflow...");
    console.log("-".repeat(60));
    console.log("");

    const result = await runRemediationWorkflow(config);

    console.log("");
    console.log("=".repeat(60));
    console.log("Workflow Results");
    console.log("=".repeat(60));
    console.log(result.summary);
    console.log("");

    if (result.results.length > 0) {
      console.log("-".repeat(60));
      console.log("Error Details:");
      console.log("-".repeat(60));

      for (const r of result.results) {
        console.log("");
        console.log(`Error: ${r.errorSignature}`);
        console.log(`  Category: ${r.triage.category}`);
        console.log(`  Severity: ${r.triage.severity}`);
        console.log(`  Summary: ${r.triage.summary}`);
        console.log(`  Root Cause: ${r.rootCause.rootCause}`);
        console.log(`  Fix Complexity: ${r.rootCause.fixComplexity}`);
        console.log(`  Confidence: ${r.rootCause.confidence}`);
        if (r.issueUrl) {
          console.log(`  Issue: ${r.issueUrl}`);
        }
        if (r.copilotAssigned) {
          console.log(`  Copilot: Assigned`);
        }
      }
    }

    return;
  }

  // Option 2: Just discover and analyze (default)
  console.log("-".repeat(60));
  console.log("Step 1: Discovering errors from Elastic...");
  console.log("-".repeat(60));
  console.log("");

  const discovery = await discoverErrors({
    serviceName: config.serviceName,
    index: config.index,
    timeRangeMinutes: config.timeRangeMinutes,
    maxErrors: config.maxIssues,
  });

  console.log(`Found ${discovery.uniqueErrorCount} unique errors`);
  console.log(`Total error count: ${discovery.totalErrorCount}`);
  console.log("");

  if (discovery.errors.length === 0) {
    console.log("No errors found. Try increasing the time range.");
    return;
  }

  // Analyze each error
  console.log("-".repeat(60));
  console.log("Step 2: Analyzing errors...");
  console.log("-".repeat(60));

  for (const error of discovery.errors) {
    console.log("");
    console.log(`Analyzing: ${error.errorType}`);
    console.log(`  Message: ${error.errorMessage.substring(0, 100)}...`);
    console.log(`  Occurrences: ${error.occurrenceCount}`);
    console.log(`  Location: ${error.filePath || "unknown"}:${error.lineNumber || "?"}`);
    console.log("");

    const { triage, rootCause } = await triageAndAnalyze(error);

    console.log("  Triage Results:");
    console.log(`    Category: ${triage.category}`);
    console.log(`    Severity: ${triage.severity}`);
    console.log(`    Summary: ${triage.summary}`);
    console.log(`    Requires Immediate: ${triage.requiresImmediate}`);
    console.log("");

    console.log("  Root Cause Analysis:");
    console.log(`    Root Cause: ${rootCause.rootCause}`);
    console.log(`    Fix Complexity: ${rootCause.fixComplexity}`);
    console.log(`    Confidence: ${rootCause.confidence}`);
    console.log("");

    console.log("  Suggested Fix:");
    console.log(`    ${rootCause.suggestedFix}`);
    console.log("");

    // Show what the GitHub issue would look like
    console.log("-".repeat(40));
    console.log("  GitHub Issue Preview:");
    console.log("-".repeat(40));
    const issueBody = formatRootCauseForIssue(error, triage, rootCause);
    // Show first 500 chars of issue body
    console.log(issueBody.substring(0, 500) + "...");
    console.log("");
  }

  console.log("=".repeat(60));
  console.log("Demo complete!");
  console.log("");
  console.log("To run the full workflow (create issues and assign Copilot):");
  console.log("  1. Set dryRun: false in the config");
  console.log("  2. Run with --full flag: pnpm tsx src/demo-remediation.ts --full");
  console.log("=".repeat(60));
}

main().catch(console.error);
