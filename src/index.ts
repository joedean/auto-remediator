/**
 * Auto-Remediator
 * Automated code remediation tool using AI-powered agents
 */

// Triage Types
export type {
  TriageResult,
  TriageInput,
  Severity,
  ErrorCategory,
} from "./types/triage.js";
export {
  TriageResultSchema,
  TriageInputSchema,
  SeveritySchema,
  ErrorCategorySchema,
} from "./types/triage.js";

// Remediation Types
export type {
  ErrorDiscoveryInput,
  ErrorDiscoveryResult,
  DiscoveredError,
  RootCauseAnalysis,
  RemediationWorkflowInput,
  RemediationWorkflowResult,
  ErrorRemediationResult,
} from "./types/remediation.js";
export {
  ErrorDiscoveryInputSchema,
  ErrorDiscoveryResultSchema,
  DiscoveredErrorSchema,
  RootCauseAnalysisSchema,
  RemediationWorkflowInputSchema,
  RemediationWorkflowResultSchema,
  ErrorRemediationResultSchema,
} from "./types/remediation.js";

// Triage Agent
export { triageAgent, triageError } from "./agents/triage-agent.js";

// Issue to Fix Agent
export {
  runIssueToFixWorkflow,
  IssueToFixResultSchema,
  type IssueToFixResult,
  type IssueToFixInput,
} from "./agents/issue-to-fix-agent.js";

// Error Discovery Agent
export {
  discoverErrors,
  discoverErrorsDirect,
} from "./agents/error-discovery-agent.js";

// Root Cause Agent
export {
  rootCauseAgent,
  analyzeRootCause,
  triageAndAnalyze,
  formatRootCauseForIssue,
} from "./agents/root-cause-agent.js";

// Remediation Workflow
export { runRemediationWorkflow } from "./agents/remediation-workflow.js";

// GitHub MCP Client
export {
  GitHubMCPClient,
  createGitHubMCPClient,
  createGitHubMCPServer,
  IssueToFixInputSchema,
} from "./mcp/github-mcp-client.js";

// Elastic MCP Client
export {
  ElasticMCPClient,
  createElasticMCPClient,
  createElasticMCPServer,
  getElasticMCPConfig,
  ElasticSearchInputSchema,
  ESQLQueryInputSchema,
  UniqueErrorsInputSchema,
  ElasticErrorSchema,
  UniqueErrorGroupSchema,
  type ElasticMCPConfig,
  type ElasticSearchInput,
  type ESQLQueryInput,
  type UniqueErrorsInput,
  type ElasticError,
  type UniqueErrorGroup,
} from "./mcp/elastic-mcp-client.js";

export function main(): void {
  console.warn("Auto-Remediator starting...");
}

// Only run main when executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
