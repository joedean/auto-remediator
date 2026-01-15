/**
 * Demo script to manually test the triage agent
 * Run with: pnpm tsx --env-file=.env src/demo.ts
 */

import { triageError } from "./agents/triage-agent.js";

const exampleError = {
  errorMessage: "TypeError: Cannot read property 'email' of undefined",
  stackTrace: `TypeError: Cannot read property 'email' of undefined
    at UserService.sendWelcomeEmail (src/services/user.ts:142:28)
    at UserService.createUser (src/services/user.ts:87:10)
    at async POST /api/users (src/routes/users.ts:23:5)`,
  context: {
    endpoint: "POST /api/users",
    requestBody: { name: "John Doe" },
  },
};

async function main(): Promise<void> {
  console.log("🔍 Triaging error...\n");
  console.log("Input:");
  console.log("─".repeat(50));
  console.log(`Error: ${exampleError.errorMessage}`);
  console.log(`Stack: ${exampleError.stackTrace.split("\n")[1]?.trim() ?? ""}`);
  console.log("─".repeat(50));
  console.log();

  const result = await triageError(exampleError);

  console.log("📋 Triage Result:");
  console.log("─".repeat(50));
  console.log(`Category:    ${result.category}`);
  console.log(`Severity:    ${result.severity}`);
  console.log(`Immediate:   ${result.requiresImmediate ? "Yes" : "No"}`);
  console.log(`Component:   ${result.affectedComponent}`);
  console.log();
  console.log(`Summary:     ${result.summary}`);
  console.log(`Root Cause:  ${result.rootCause}`);
  console.log();
  console.log("Suggested Fixes:");
  result.suggestedFixes.forEach((fix, i) => {
    console.log(`  ${i + 1}. ${fix}`);
  });
  if (result.additionalContext) {
    console.log();
    console.log(`Context:     ${result.additionalContext}`);
  }
  console.log("─".repeat(50));
}

main().catch(console.error);
