import { Agent, run } from "@openai/agents";
import {
  RootCauseAnalysisSchema,
  type RootCauseAnalysis,
  type DiscoveredError,
} from "../types/remediation.js";
import { type TriageResult } from "../types/triage.js";
import { triageError } from "./triage-agent.js";

/**
 * System prompt for root cause analysis
 */
const rootCauseInstructions = `You are an expert root cause analysis agent for software errors.

Given an error with its stack trace and context, your job is to:

1. IDENTIFY THE ROOT CAUSE
   - Analyze the stack trace to find the exact code location
   - Understand what operation was attempted and why it failed
   - Consider common patterns that lead to this type of error

2. DETERMINE THE CODE FIX
   - Provide a specific, actionable fix for the error
   - Include code snippets when helpful
   - Consider edge cases the fix should handle

3. ASSESS COMPLEXITY
   - trivial: One-line fix, obvious solution
   - simple: Small change, clear approach
   - moderate: Multiple files or non-obvious logic
   - complex: Architectural changes or significant refactoring

4. RATE YOUR CONFIDENCE
   - high: Stack trace clearly shows the issue, fix is certain
   - medium: Good understanding but some assumptions made
   - low: Limited information, fix is speculative

Be precise and actionable. Developers should be able to implement your fix directly.`;

/**
 * Agent for performing root cause analysis
 */
export const rootCauseAgent = new Agent({
  name: "Root Cause Analysis Agent",
  instructions: rootCauseInstructions,
  model: "gpt-4o",
  outputType: RootCauseAnalysisSchema,
});

/**
 * Perform root cause analysis on a discovered error
 */
export async function analyzeRootCause(
  error: DiscoveredError
): Promise<RootCauseAnalysis> {
  const prompt = buildRootCausePrompt(error);
  const result = await run(rootCauseAgent, prompt);

  if (!result.finalOutput) {
    // Return a default analysis if agent fails
    return {
      errorSignature: error.errorSignature,
      rootCause: "Unable to determine root cause from available information",
      codeLocation: error.filePath
        ? {
            filePath: error.filePath,
            functionName: error.functionName,
            lineNumber: error.lineNumber,
          }
        : null,
      suggestedFix: "Manual investigation required",
      fixComplexity: "moderate",
      confidence: "low",
      additionalContext: null,
    };
  }

  return {
    ...result.finalOutput,
    errorSignature: error.errorSignature,
  };
}

/**
 * Perform both triage and root cause analysis
 */
export async function triageAndAnalyze(
  error: DiscoveredError
): Promise<{ triage: TriageResult; rootCause: RootCauseAnalysis }> {
  // Run triage and root cause analysis in parallel
  const [triage, rootCause] = await Promise.all([
    triageError({
      errorMessage: error.errorMessage,
      stackTrace: error.sampleStackTrace || undefined,
      context: {
        errorType: error.errorType,
        filePath: error.filePath,
        functionName: error.functionName,
        lineNumber: error.lineNumber,
        occurrenceCount: error.occurrenceCount,
        firstOccurrence: error.firstOccurrence,
        lastOccurrence: error.lastOccurrence,
      },
    }),
    analyzeRootCause(error),
  ]);

  return { triage, rootCause };
}

/**
 * Build the prompt for root cause analysis
 */
function buildRootCausePrompt(error: DiscoveredError): string {
  const parts: string[] = [
    `Analyze the root cause of this error:`,
    ``,
    `Error Type: ${error.errorType}`,
    `Error Message: ${error.errorMessage}`,
  ];

  if (error.filePath) {
    parts.push(`File: ${error.filePath}`);
  }

  if (error.functionName) {
    parts.push(`Function: ${error.functionName}`);
  }

  if (error.lineNumber) {
    parts.push(`Line: ${error.lineNumber}`);
  }

  parts.push(`Occurrences: ${error.occurrenceCount}`);
  parts.push(`First seen: ${error.firstOccurrence}`);
  parts.push(`Last seen: ${error.lastOccurrence}`);

  if (error.sampleStackTrace) {
    parts.push(``, `Stack Trace:`, error.sampleStackTrace);
  }

  parts.push(
    ``,
    `Provide a detailed root cause analysis with a specific, implementable fix.`
  );

  return parts.join("\n");
}

/**
 * Format root cause analysis for GitHub issue description
 */
export function formatRootCauseForIssue(
  error: DiscoveredError,
  triage: TriageResult,
  rootCause: RootCauseAnalysis
): string {
  const sections: string[] = [];

  // Summary section
  sections.push(`## Summary`);
  sections.push(triage.summary);
  sections.push(``);

  // Error details
  sections.push(`## Error Details`);
  sections.push(`- **Type:** ${error.errorType}`);
  sections.push(`- **Category:** ${triage.category}`);
  sections.push(`- **Severity:** ${triage.severity}`);
  sections.push(`- **Occurrences:** ${error.occurrenceCount}`);
  sections.push(`- **First seen:** ${error.firstOccurrence}`);
  sections.push(`- **Last seen:** ${error.lastOccurrence}`);
  sections.push(``);

  // Code location
  if (rootCause.codeLocation) {
    sections.push(`## Code Location`);
    sections.push(`- **File:** \`${rootCause.codeLocation.filePath}\``);
    if (rootCause.codeLocation.functionName) {
      sections.push(`- **Function:** \`${rootCause.codeLocation.functionName}\``);
    }
    if (rootCause.codeLocation.lineNumber) {
      sections.push(`- **Line:** ${rootCause.codeLocation.lineNumber}`);
    }
    sections.push(``);
  }

  // Root cause
  sections.push(`## Root Cause`);
  sections.push(rootCause.rootCause);
  sections.push(``);

  // Suggested fix
  sections.push(`## Suggested Fix`);
  sections.push(rootCause.suggestedFix);
  sections.push(``);

  // Fix metadata
  sections.push(`## Fix Metadata`);
  sections.push(`- **Complexity:** ${rootCause.fixComplexity}`);
  sections.push(`- **Confidence:** ${rootCause.confidence}`);
  sections.push(``);

  // Stack trace (collapsed)
  if (error.sampleStackTrace) {
    sections.push(`<details>`);
    sections.push(`<summary>Stack Trace</summary>`);
    sections.push(``);
    sections.push("```");
    sections.push(error.sampleStackTrace);
    sections.push("```");
    sections.push(`</details>`);
    sections.push(``);
  }

  // Additional context
  if (rootCause.additionalContext) {
    sections.push(`## Additional Context`);
    sections.push(rootCause.additionalContext);
  }

  return sections.join("\n");
}

export { RootCauseAnalysisSchema };
