import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, run } from "@openai/agents";
import { TriageResultSchema, type TriageInput, type TriageResult } from "../types/triage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const instructions = readFileSync(join(__dirname, "prompts/triage-agent.md"), "utf-8");

/**
 * Agent specialized in triaging error messages from logs.
 * Classifies errors, determines severity, and suggests fixes.
 */
export const triageAgent = new Agent({
  name: "Error Triage Agent",
  instructions,
  model: "gpt-4o",
  outputType: TriageResultSchema,
});

/**
 * Triage an error message and return structured analysis
 */
export async function triageError(input: TriageInput): Promise<TriageResult> {
  const prompt = buildTriagePrompt(input);
  const result = await run(triageAgent, prompt);

  if (!result.finalOutput) {
    throw new Error("Triage agent returned no output");
  }

  return result.finalOutput;
}

/**
 * Build a prompt from the triage input
 */
function buildTriagePrompt(input: TriageInput): string {
  const parts: string[] = [`Error Message:\n${input.errorMessage}`];

  if (input.stackTrace) {
    parts.push(`\nStack Trace:\n${input.stackTrace}`);
  }

  if (input.timestamp) {
    parts.push(`\nTimestamp: ${input.timestamp}`);
  }

  if (input.context && Object.keys(input.context).length > 0) {
    parts.push(`\nContext:\n${JSON.stringify(input.context, null, 2)}`);
  }

  return parts.join("\n");
}