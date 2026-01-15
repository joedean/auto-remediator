import { describe, it, expect, vi, beforeEach } from "vitest";
import { triageAgent, triageError } from "./triage-agent.js";
import {
  TriageResultSchema,
  TriageInputSchema,
  type TriageResult,
} from "../types/triage.js";

// Mock the @openai/agents module
vi.mock("@openai/agents", () => ({
  Agent: class MockAgent {
    name: string;
    model: string;
    instructions: string;
    outputType: unknown;

    constructor(config: {
      name: string;
      model: string;
      instructions: string;
      outputType: unknown;
    }) {
      this.name = config.name;
      this.model = config.model;
      this.instructions = config.instructions;
      this.outputType = config.outputType;
    }
  },
  run: vi.fn(),
}));

import { run } from "@openai/agents";

const mockRun = vi.mocked(run);

describe("triageAgent", () => {
  it("should have correct configuration", () => {
    expect(triageAgent.name).toBe("Error Triage Agent");
    expect(triageAgent.model).toBe("gpt-4o");
    expect(triageAgent.outputType).toBe(TriageResultSchema);
  });

  it("should have instructions that cover error classification", () => {
    expect(triageAgent.instructions).toContain("CLASSIFY");
    expect(triageAgent.instructions).toContain("syntax");
    expect(triageAgent.instructions).toContain("runtime");
    expect(triageAgent.instructions).toContain("network");
  });

  it("should have instructions that cover severity assessment", () => {
    expect(triageAgent.instructions).toContain("ASSESS severity");
    expect(triageAgent.instructions).toContain("critical");
    expect(triageAgent.instructions).toContain("high");
    expect(triageAgent.instructions).toContain("medium");
    expect(triageAgent.instructions).toContain("low");
  });
});

describe("triageError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return structured triage result", async () => {
    const mockResult: TriageResult = {
      category: "runtime",
      severity: "high",
      summary: "Null pointer exception in user service",
      rootCause: "Attempting to access property on undefined user object",
      affectedComponent: "src/services/user.ts",
      suggestedFixes: [
        "Add null check before accessing user properties",
        "Ensure user is fetched before processing",
      ],
      requiresImmediate: true,
      additionalContext: null,
    };

    mockRun.mockResolvedValueOnce({
      finalOutput: mockResult,
    } as never);

    const result = await triageError({
      errorMessage: "TypeError: Cannot read property 'name' of undefined",
      stackTrace: "at UserService.getUser (src/services/user.ts:42)",
    });

    expect(result).toEqual(mockResult);
    expect(mockRun).toHaveBeenCalledOnce();
  });

  it("should include stack trace in prompt when provided", async () => {
    const mockResult: TriageResult = {
      category: "type",
      severity: "medium",
      summary: "Type error",
      rootCause: "Type mismatch",
      affectedComponent: "src/index.ts",
      suggestedFixes: ["Fix types"],
      requiresImmediate: false,
      additionalContext: null,
    };

    mockRun.mockResolvedValueOnce({
      finalOutput: mockResult,
    } as never);

    await triageError({
      errorMessage: "Error",
      stackTrace: "at main (index.ts:10)",
    });

    const callArgs = mockRun.mock.calls[0]!;
    const prompt = callArgs[1] as string;

    expect(prompt).toContain("Stack Trace:");
    expect(prompt).toContain("at main (index.ts:10)");
  });

  it("should include context in prompt when provided", async () => {
    const mockResult: TriageResult = {
      category: "validation",
      severity: "low",
      summary: "Validation error",
      rootCause: "Invalid input",
      affectedComponent: "src/api.ts",
      suggestedFixes: ["Validate input"],
      requiresImmediate: false,
      additionalContext: null,
    };

    mockRun.mockResolvedValueOnce({
      finalOutput: mockResult,
    } as never);

    await triageError({
      errorMessage: "Validation failed",
      context: { userId: "123", endpoint: "/api/users" },
    });

    const callArgs = mockRun.mock.calls[0]!;
    const prompt = callArgs[1] as string;

    expect(prompt).toContain("Context:");
    expect(prompt).toContain("userId");
    expect(prompt).toContain("123");
  });

  it("should throw error when agent returns no output", async () => {
    mockRun.mockResolvedValueOnce({
      finalOutput: null,
    } as never);

    await expect(
      triageError({ errorMessage: "Some error" })
    ).rejects.toThrow("Triage agent returned no output");
  });
});

describe("TriageInputSchema", () => {
  it("should validate valid input", () => {
    const input = {
      errorMessage: "Error occurred",
      stackTrace: "at foo (bar.ts:1)",
      timestamp: "2024-01-01T00:00:00Z",
      context: { key: "value" },
    };

    const result = TriageInputSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should require errorMessage", () => {
    expect(() => TriageInputSchema.parse({})).toThrow();
  });

  it("should allow optional fields to be omitted", () => {
    const input = { errorMessage: "Error" };
    const result = TriageInputSchema.parse(input);
    expect(result.errorMessage).toBe("Error");
    expect(result.stackTrace).toBeUndefined();
  });
});

describe("TriageResultSchema", () => {
  it("should validate valid result", () => {
    const result: TriageResult = {
      category: "runtime",
      severity: "high",
      summary: "Error summary",
      rootCause: "Root cause",
      affectedComponent: "component.ts",
      suggestedFixes: ["Fix 1", "Fix 2"],
      requiresImmediate: true,
      additionalContext: null,
    };

    const parsed = TriageResultSchema.parse(result);
    expect(parsed).toEqual(result);
  });

  it("should accept additionalContext as string", () => {
    const result: TriageResult = {
      category: "runtime",
      severity: "high",
      summary: "Error summary",
      rootCause: "Root cause",
      affectedComponent: "component.ts",
      suggestedFixes: ["Fix 1"],
      requiresImmediate: false,
      additionalContext: "Some extra context",
    };

    const parsed = TriageResultSchema.parse(result);
    expect(parsed.additionalContext).toBe("Some extra context");
  });

  it("should reject invalid category", () => {
    const result = {
      category: "invalid",
      severity: "high",
      summary: "Error",
      rootCause: "Cause",
      affectedComponent: "comp.ts",
      suggestedFixes: [],
      requiresImmediate: false,
    };

    expect(() => TriageResultSchema.parse(result)).toThrow();
  });

  it("should reject invalid severity", () => {
    const result = {
      category: "runtime",
      severity: "urgent",
      summary: "Error",
      rootCause: "Cause",
      affectedComponent: "comp.ts",
      suggestedFixes: [],
      requiresImmediate: false,
    };

    expect(() => TriageResultSchema.parse(result)).toThrow();
  });
});