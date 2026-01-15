import { z } from "zod";
import { TriageResultSchema } from "./triage.js";

/**
 * Input for error discovery from Elastic
 */
export const ErrorDiscoveryInputSchema = z.object({
  serviceName: z.string().describe("Service name to search errors for"),
  index: z
    .string()
    .optional()
    .describe("Optional index override (defaults to logs-apm.app.{service_name}-default)"),
  timeRangeMinutes: z
    .number()
    .default(15)
    .describe("Time range in minutes (e.g., 15, 60, 1440)"),
  maxErrors: z
    .number()
    .default(10)
    .describe("Maximum number of unique errors to return"),
});
export type ErrorDiscoveryInput = z.infer<typeof ErrorDiscoveryInputSchema>;

/**
 * A discovered error from Elastic logs
 */
export const DiscoveredErrorSchema = z.object({
  errorSignature: z.string().describe("Unique identifier for this error type"),
  errorType: z.string().describe("Type of error (e.g., IndexError, TypeError)"),
  errorMessage: z.string().describe("The error message pattern"),
  filePath: z.string().nullable().describe("File where error originates"),
  functionName: z.string().nullable().describe("Function where error originates"),
  lineNumber: z.number().nullable().describe("Line number of error"),
  occurrenceCount: z.number().describe("Number of times this error occurred"),
  firstOccurrence: z.string().describe("First time error was seen"),
  lastOccurrence: z.string().describe("Most recent occurrence"),
  sampleStackTrace: z.string().nullable().describe("Sample stack trace"),
});
export type DiscoveredError = z.infer<typeof DiscoveredErrorSchema>;

/**
 * Result from error discovery
 */
export const ErrorDiscoveryResultSchema = z.object({
  serviceName: z.string().describe("Service that was searched"),
  timeRangeMinutes: z.number().describe("Time range in minutes that was searched"),
  totalErrorCount: z.number().describe("Total errors found"),
  uniqueErrorCount: z.number().describe("Number of unique error types"),
  errors: z.array(DiscoveredErrorSchema).describe("List of unique errors"),
  queryExecuted: z.string().nullable().describe("ES|QL query that was executed"),
});
export type ErrorDiscoveryResult = z.infer<typeof ErrorDiscoveryResultSchema>;

/**
 * Root cause analysis for an error
 */
export const RootCauseAnalysisSchema = z.object({
  errorSignature: z.string().describe("Error being analyzed"),
  rootCause: z.string().describe("Identified root cause"),
  codeLocation: z
    .object({
      filePath: z.string(),
      functionName: z.string().nullable(),
      lineNumber: z.number().nullable(),
    })
    .nullable()
    .describe("Code location where fix is needed"),
  suggestedFix: z.string().describe("Recommended code fix"),
  fixComplexity: z
    .enum(["trivial", "simple", "moderate", "complex"])
    .describe("Estimated complexity of the fix"),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("Confidence in the analysis"),
  additionalContext: z.string().nullable().describe("Any additional context"),
});
export type RootCauseAnalysis = z.infer<typeof RootCauseAnalysisSchema>;

/**
 * Input for the full remediation workflow
 */
export const RemediationWorkflowInputSchema = z.object({
  serviceName: z.string().describe("Service to remediate errors for"),
  index: z
    .string()
    .optional()
    .describe("Optional index override (defaults to logs-apm.app.{service_name}-default)"),
  timeRangeMinutes: z
    .number()
    .default(15)
    .describe("Time range in minutes to search for errors"),
  owner: z.string().describe("GitHub repository owner"),
  repo: z.string().describe("GitHub repository name"),
  maxIssues: z
    .number()
    .default(5)
    .describe("Maximum number of issues to create"),
  dryRun: z
    .boolean()
    .default(false)
    .describe("If true, analyze but don't create issues"),
});
export type RemediationWorkflowInput = z.infer<typeof RemediationWorkflowInputSchema>;

/**
 * Result for a single error remediation
 */
export const ErrorRemediationResultSchema = z.object({
  errorSignature: z.string().describe("Error that was processed"),
  triage: TriageResultSchema.describe("Triage analysis"),
  rootCause: RootCauseAnalysisSchema.describe("Root cause analysis"),
  issueCreated: z.boolean().describe("Whether an issue was created"),
  issueNumber: z.number().nullable().describe("Created issue number"),
  issueUrl: z.string().nullable().describe("URL to the created issue"),
  copilotAssigned: z.boolean().describe("Whether Copilot was assigned"),
  prNumber: z.number().nullable().describe("PR number if created"),
  prUrl: z.string().nullable().describe("URL to the PR if created"),
});
export type ErrorRemediationResult = z.infer<typeof ErrorRemediationResultSchema>;

/**
 * Full result from the remediation workflow
 */
export const RemediationWorkflowResultSchema = z.object({
  serviceName: z.string().describe("Service that was remediated"),
  timeRangeMinutes: z.number().describe("Time range in minutes searched"),
  errorsDiscovered: z.number().describe("Total unique errors found"),
  errorsProcessed: z.number().describe("Number of errors processed"),
  issuesCreated: z.number().describe("Number of GitHub issues created"),
  results: z.array(ErrorRemediationResultSchema).describe("Results per error"),
  summary: z.string().describe("Human-readable summary"),
  success: z.boolean().describe("Whether workflow completed successfully"),
});
export type RemediationWorkflowResult = z.infer<typeof RemediationWorkflowResultSchema>;
