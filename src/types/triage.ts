import { z } from "zod";

/**
 * Error severity levels
 */
export const SeveritySchema = z.enum(["critical", "high", "medium", "low"]);
export type Severity = z.infer<typeof SeveritySchema>;

/**
 * Error categories for classification
 */
export const ErrorCategorySchema = z.enum([
  "syntax",
  "runtime",
  "type",
  "network",
  "database",
  "authentication",
  "authorization",
  "validation",
  "configuration",
  "dependency",
  "memory",
  "timeout",
  "unknown",
]);
export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

/**
 * Structured triage result from the agent
 */
export const TriageResultSchema = z.object({
  category: ErrorCategorySchema.describe("The classification of the error"),
  severity: SeveritySchema.describe("How critical is this error"),
  summary: z.string().describe("Brief one-line summary of the error"),
  rootCause: z.string().describe("Likely root cause of the error"),
  affectedComponent: z
    .string()
    .describe("The component, file, or service affected"),
  suggestedFixes: z
    .array(z.string())
    .describe("Ordered list of potential fixes to try"),
  requiresImmediate: z
    .boolean()
    .describe("Whether this error requires immediate attention"),
  additionalContext: z
    .string()
    .nullable()
    .describe("Any additional relevant context"),
});
export type TriageResult = z.infer<typeof TriageResultSchema>;

/**
 * Input for the triage agent
 */
export const TriageInputSchema = z.object({
  errorMessage: z.string().describe("The error message from the log"),
  stackTrace: z.string().optional().describe("Stack trace if available"),
  timestamp: z.string().optional().describe("When the error occurred"),
  context: z
    .record(z.unknown())
    .optional()
    .describe("Additional context like request data, user info, etc."),
});
export type TriageInput = z.infer<typeof TriageInputSchema>;
