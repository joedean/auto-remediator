import { z } from "zod";
import { discoverErrors } from "./error-discovery-agent.js";
import { triageAndAnalyze, formatRootCauseForIssue } from "./root-cause-agent.js";
import {
  createGitHubMCPServer,
} from "../mcp/github-mcp-client.js";
import { Agent, run } from "@openai/agents";
import {
  type RemediationWorkflowInput,
  type RemediationWorkflowResult,
  type ErrorRemediationResult,
  type DiscoveredError,
  type RootCauseAnalysis,
  RemediationWorkflowResultSchema,
} from "../types/remediation.js";
import { type TriageResult } from "../types/triage.js";

/**
 * Run the full remediation workflow:
 * 1. Discover unique errors from Elastic
 * 2. Triage and analyze root cause for each
 * 3. Create GitHub issues with fix suggestions
 * 4. Optionally assign Copilot to create PRs
 */
export async function runRemediationWorkflow(
  input: RemediationWorkflowInput
): Promise<RemediationWorkflowResult> {
  const results: ErrorRemediationResult[] = [];
  let issuesCreated = 0;

  console.log(`Starting remediation workflow for ${input.serviceName}...`);

  // Step 1: Discover errors
  console.log(`Discovering errors from the last ${input.timeRangeMinutes} minutes...`);
  const discovery = await discoverErrors({
    serviceName: input.serviceName,
    index: input.index,
    timeRangeMinutes: input.timeRangeMinutes,
    maxErrors: input.maxIssues,
  });

  console.log(`Found ${discovery.uniqueErrorCount} unique errors`);

  if (discovery.errors.length === 0) {
    return {
      serviceName: input.serviceName,
      timeRangeMinutes: input.timeRangeMinutes,
      errorsDiscovered: 0,
      errorsProcessed: 0,
      issuesCreated: 0,
      results: [],
      summary: `No errors found for ${input.serviceName} in the last ${input.timeRangeMinutes} minutes`,
      success: true,
    };
  }

  // Step 2: Process each error
  for (const error of discovery.errors) {
    console.log(`Processing error: ${error.errorType} (${error.occurrenceCount} occurrences)`);

    try {
      const remediationResult = await processError(error, input);
      results.push(remediationResult);

      if (remediationResult.issueCreated) {
        issuesCreated++;
      }
    } catch (err) {
      console.error(`Failed to process error ${error.errorSignature}:`, err);
      results.push({
        errorSignature: error.errorSignature,
        triage: {
          category: "unknown",
          severity: "medium",
          summary: "Failed to triage error",
          rootCause: "Processing failed",
          affectedComponent: error.filePath || "unknown",
          suggestedFixes: [],
          requiresImmediate: false,
          additionalContext: String(err),
        },
        rootCause: {
          errorSignature: error.errorSignature,
          rootCause: "Unable to determine - processing failed",
          codeLocation: null,
          suggestedFix: "Manual investigation required",
          fixComplexity: "moderate",
          confidence: "low",
          additionalContext: String(err),
        },
        issueCreated: false,
        issueNumber: null,
        issueUrl: null,
        copilotAssigned: false,
        prNumber: null,
        prUrl: null,
      });
    }
  }

  const summary = buildWorkflowSummary(input, discovery.uniqueErrorCount, results, issuesCreated);

  return {
    serviceName: input.serviceName,
    timeRangeMinutes: input.timeRangeMinutes,
    errorsDiscovered: discovery.uniqueErrorCount,
    errorsProcessed: results.length,
    issuesCreated,
    results,
    summary,
    success: true,
  };
}

/**
 * Process a single error through triage, analysis, and issue creation
 */
async function processError(
  error: DiscoveredError,
  input: RemediationWorkflowInput
): Promise<ErrorRemediationResult> {
  // Step 2a: Triage and analyze
  console.log(`  Analyzing root cause...`);
  const { triage, rootCause } = await triageAndAnalyze(error);

  // Step 2b: Create GitHub issue (unless dry run)
  let issueNumber: number | null = null;
  let issueUrl: string | null = null;
  let copilotAssigned = false;
  let prNumber: number | null = null;
  let prUrl: string | null = null;

  if (!input.dryRun) {
    console.log(`  Creating GitHub issue...`);
    const issueResult = await createGitHubIssue(
      error,
      triage,
      rootCause,
      input,
      formatRootCauseForIssue(error, triage, rootCause)
    );

    issueNumber = issueResult.issueNumber;
    issueUrl = issueResult.issueUrl;

    // Step 2c: Assign Copilot to the issue
    if (issueNumber) {
      console.log(`  Assigning Copilot to issue #${issueNumber}...`);
      const copilotResult = await assignCopilotToIssue(
        input.owner,
        input.repo,
        issueNumber
      );
      copilotAssigned = copilotResult.assigned;
      prNumber = copilotResult.prNumber;
      prUrl = copilotResult.prUrl;
    }
  } else {
    console.log(`  Dry run - skipping issue creation`);
  }

  return {
    errorSignature: error.errorSignature,
    triage,
    rootCause,
    issueCreated: issueNumber !== null,
    issueNumber,
    issueUrl,
    copilotAssigned,
    prNumber,
    prUrl,
  };
}

/**
 * Create a GitHub issue for the error
 */
async function createGitHubIssue(
  error: DiscoveredError,
  triage: TriageResult,
  rootCause: RootCauseAnalysis,
  input: { owner: string; repo: string },
  description: string
): Promise<{ issueNumber: number | null; issueUrl: string | null }> {
  const githubMcp = createGitHubMCPServer();

  try {
    await githubMcp.connect();

    const issueAgent = new Agent({
      name: "Issue Creator Agent",
      instructions: `You create GitHub issues for errors. Use the issue_write tool to create issues.`,
      model: "gpt-4o",
      mcpServers: [githubMcp],
      outputType: z.object({
        issueNumber: z.number().nullable(),
        issueUrl: z.string().nullable(),
      }),
    });

    const title = buildIssueTitle(error, triage);
    const labels = buildIssueLabels(triage, rootCause);

    const prompt = `Create a GitHub issue in ${input.owner}/${input.repo} with:
- Title: ${title}
- Labels: ${labels.join(", ")}
- Body:
${description}

Return the issue number and URL after creating it.`;

    const result = await run(issueAgent, prompt);

    return {
      issueNumber: result.finalOutput?.issueNumber || null,
      issueUrl: result.finalOutput?.issueUrl || null,
    };
  } catch (err) {
    console.error("Failed to create GitHub issue:", err);
    return { issueNumber: null, issueUrl: null };
  } finally {
    await githubMcp.close();
  }
}

/**
 * Assign GitHub Copilot to work on an issue
 */
async function assignCopilotToIssue(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<{ assigned: boolean; prNumber: number | null; prUrl: string | null }> {
  const githubMcp = createGitHubMCPServer();

  try {
    await githubMcp.connect();

    const copilotAgent = new Agent({
      name: "Copilot Assignment Agent",
      instructions: `You assign GitHub Copilot to issues using the assign_copilot_to_issue tool.`,
      model: "gpt-4o",
      mcpServers: [githubMcp],
      outputType: z.object({
        assigned: z.boolean(),
        message: z.string(),
      }),
    });

    const prompt = `Assign GitHub Copilot to issue #${issueNumber} in ${owner}/${repo}.
Use the assign_copilot_to_issue tool with owner="${owner}", repo="${repo}", issueNumber=${issueNumber}.`;

    const result = await run(copilotAgent, prompt);

    return {
      assigned: result.finalOutput?.assigned || false,
      prNumber: null, // PR will be created asynchronously by Copilot
      prUrl: null,
    };
  } catch (err) {
    console.error("Failed to assign Copilot:", err);
    return { assigned: false, prNumber: null, prUrl: null };
  } finally {
    await githubMcp.close();
  }
}

/**
 * Build a descriptive issue title
 */
function buildIssueTitle(
  error: DiscoveredError,
  triage: TriageResult
): string {
  const severityPrefix =
    triage.severity === "critical" || triage.severity === "high"
      ? `[${triage.severity.toUpperCase()}] `
      : "";

  const location = error.functionName
    ? `in ${error.functionName}`
    : error.filePath
      ? `in ${error.filePath.split("/").pop()}`
      : "";

  return `${severityPrefix}Fix ${error.errorType} ${location}`.trim();
}

/**
 * Build labels for the issue
 */
function buildIssueLabels(
  triage: TriageResult,
  rootCause: RootCauseAnalysis
): string[] {
  const labels = ["auto-remediation", "bug"];

  // Add severity label
  if (triage.severity === "critical" || triage.severity === "high") {
    labels.push(`priority:${triage.severity}`);
  }

  // Add category label
  labels.push(`type:${triage.category}`);

  // Add complexity label
  if (rootCause.fixComplexity === "trivial" || rootCause.fixComplexity === "simple") {
    labels.push("good-first-issue");
  }

  return labels;
}

/**
 * Build a human-readable summary of the workflow
 */
function buildWorkflowSummary(
  input: RemediationWorkflowInput,
  errorsDiscovered: number,
  results: ErrorRemediationResult[],
  issuesCreated: number
): string {
  const lines: string[] = [
    `Remediation workflow completed for ${input.serviceName}`,
    `Time range: ${input.timeRangeMinutes} minutes`,
    `Errors discovered: ${errorsDiscovered}`,
    `Errors processed: ${results.length}`,
    `Issues created: ${issuesCreated}`,
  ];

  if (input.dryRun) {
    lines.push(`Mode: Dry run (no issues created)`);
  }

  const copilotAssigned = results.filter((r) => r.copilotAssigned).length;
  if (copilotAssigned > 0) {
    lines.push(`Copilot assigned: ${copilotAssigned} issues`);
  }

  // Add severity breakdown
  const critical = results.filter((r) => r.triage.severity === "critical").length;
  const high = results.filter((r) => r.triage.severity === "high").length;
  const medium = results.filter((r) => r.triage.severity === "medium").length;
  const low = results.filter((r) => r.triage.severity === "low").length;

  lines.push(`Severity breakdown: ${critical} critical, ${high} high, ${medium} medium, ${low} low`);

  return lines.join("\n");
}

export { RemediationWorkflowResultSchema };
