import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runIssueToFixWorkflow,
  IssueToFixResultSchema,
  type IssueToFixResult,
} from "./issue-to-fix-agent.js";
import { IssueToFixInputSchema } from "../mcp/github-mcp-client.js";

// Mock the @openai/agents module
vi.mock("@openai/agents", () => ({
  Agent: class MockAgent {
    name: string;
    model: string;
    instructions: string;
    mcpServers: unknown[];
    outputType: unknown;

    constructor(config: {
      name: string;
      model: string;
      instructions: string;
      mcpServers: unknown[];
      outputType: unknown;
    }) {
      this.name = config.name;
      this.model = config.model;
      this.instructions = config.instructions;
      this.mcpServers = config.mcpServers;
      this.outputType = config.outputType;
    }
  },
  run: vi.fn(),
}));

// Mock the github-mcp-client module
vi.mock("../mcp/github-mcp-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../mcp/github-mcp-client.js")>();
  return {
    ...actual,
    createGitHubMCPClient: vi.fn(),
    createGitHubMCPServer: vi.fn(),
  };
});

import { run } from "@openai/agents";
import {
  createGitHubMCPClient,
  createGitHubMCPServer,
} from "../mcp/github-mcp-client.js";

const mockRun = vi.mocked(run);
const mockCreateGitHubMCPClient = vi.mocked(createGitHubMCPClient);
const mockCreateGitHubMCPServer = vi.mocked(createGitHubMCPServer);

describe("runIssueToFixWorkflow", () => {
  const mockMCPMessages = {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: "You are a development workflow assistant.",
        },
      },
      {
        role: "user",
        content: {
          type: "text",
          text: "Create an issue titled 'Test Issue' in owner/repo.",
        },
      },
    ],
  };

  const mockMCPClient = {
    getIssueToFixPrompt: vi.fn().mockResolvedValue(mockMCPMessages),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const mockMCPServer = {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateGitHubMCPClient.mockResolvedValue(mockMCPClient as never);
    mockCreateGitHubMCPServer.mockReturnValue(mockMCPServer as never);
  });

  it("should return structured result on successful workflow", async () => {
    const mockResult: IssueToFixResult = {
      issueNumber: 42,
      issueUrl: "https://github.com/owner/repo/issues/42",
      prNumber: 43,
      prUrl: "https://github.com/owner/repo/pull/43",
      summary: "Created issue #42 and PR #43",
      success: true,
    };

    mockRun.mockResolvedValueOnce({
      finalOutput: mockResult,
    } as never);

    const result = await runIssueToFixWorkflow({
      owner: "owner",
      repo: "repo",
      title: "Test Issue",
      description: "Test description",
    });

    expect(result).toEqual(mockResult);
    expect(mockCreateGitHubMCPClient).toHaveBeenCalledOnce();
    expect(mockMCPClient.getIssueToFixPrompt).toHaveBeenCalledOnce();
    expect(mockMCPClient.close).toHaveBeenCalledOnce();
    expect(mockCreateGitHubMCPServer).toHaveBeenCalledOnce();
    expect(mockMCPServer.connect).toHaveBeenCalledOnce();
    expect(mockMCPServer.close).toHaveBeenCalledOnce();
  });

  it("should pass MCP messages as agent instructions", async () => {
    const mockResult: IssueToFixResult = {
      issueNumber: 1,
      issueUrl: "https://github.com/owner/repo/issues/1",
      prNumber: null,
      prUrl: null,
      summary: "Created issue",
      success: true,
    };

    mockRun.mockResolvedValueOnce({
      finalOutput: mockResult,
    } as never);

    await runIssueToFixWorkflow({
      owner: "owner",
      repo: "repo",
      title: "Test",
      description: "Description",
    });

    const callArgs = mockRun.mock.calls[0]!;
    const agent = callArgs[0] as { instructions: string };

    expect(agent.instructions).toContain("development workflow assistant");
    expect(agent.instructions).toContain("Create an issue titled");
  });

  it("should call run with 'Execute the workflow.' prompt", async () => {
    const mockResult: IssueToFixResult = {
      issueNumber: 1,
      issueUrl: "url",
      prNumber: null,
      prUrl: null,
      summary: "Done",
      success: true,
    };

    mockRun.mockResolvedValueOnce({
      finalOutput: mockResult,
    } as never);

    await runIssueToFixWorkflow({
      owner: "owner",
      repo: "repo",
      title: "Test",
      description: "Description",
    });

    const callArgs = mockRun.mock.calls[0]!;
    const prompt = callArgs[1] as string;

    expect(prompt).toBe("Execute the workflow.");
  });

  it("should return failure result when agent returns no output", async () => {
    mockRun.mockResolvedValueOnce({
      finalOutput: null,
    } as never);

    const result = await runIssueToFixWorkflow({
      owner: "owner",
      repo: "repo",
      title: "Test",
      description: "Description",
    });

    expect(result.success).toBe(false);
    expect(result.issueNumber).toBeNull();
    expect(result.summary).toBe("Agent did not return a structured output");
  });

  it("should throw error when MCP server returns no messages", async () => {
    mockMCPClient.getIssueToFixPrompt.mockResolvedValueOnce({
      messages: [],
    });

    await expect(
      runIssueToFixWorkflow({
        owner: "owner",
        repo: "repo",
        title: "Test",
        description: "Description",
      })
    ).rejects.toThrow("Failed to get prompt from GitHub MCP server");
  });

  it("should throw error when MCP server returns null messages", async () => {
    mockMCPClient.getIssueToFixPrompt.mockResolvedValueOnce({});

    await expect(
      runIssueToFixWorkflow({
        owner: "owner",
        repo: "repo",
        title: "Test",
        description: "Description",
      })
    ).rejects.toThrow("Failed to get prompt from GitHub MCP server");
  });

  it("should close MCP server even on error", async () => {
    mockRun.mockRejectedValueOnce(new Error("Agent error"));

    await expect(
      runIssueToFixWorkflow({
        owner: "owner",
        repo: "repo",
        title: "Test",
        description: "Description",
      })
    ).rejects.toThrow("Agent error");

    expect(mockMCPServer.close).toHaveBeenCalledOnce();
  });
});

describe("IssueToFixInputSchema", () => {
  it("should validate valid input", () => {
    const input = {
      owner: "my-org",
      repo: "my-repo",
      title: "Fix bug",
      description: "The bug needs fixing",
    };

    const result = IssueToFixInputSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should require owner", () => {
    const input = {
      repo: "my-repo",
      title: "Fix bug",
      description: "Description",
    };

    expect(() => IssueToFixInputSchema.parse(input)).toThrow();
  });

  it("should require repo", () => {
    const input = {
      owner: "my-org",
      title: "Fix bug",
      description: "Description",
    };

    expect(() => IssueToFixInputSchema.parse(input)).toThrow();
  });

  it("should require title", () => {
    const input = {
      owner: "my-org",
      repo: "my-repo",
      description: "Description",
    };

    expect(() => IssueToFixInputSchema.parse(input)).toThrow();
  });

  it("should require description", () => {
    const input = {
      owner: "my-org",
      repo: "my-repo",
      title: "Fix bug",
    };

    expect(() => IssueToFixInputSchema.parse(input)).toThrow();
  });
});

describe("IssueToFixResultSchema", () => {
  it("should validate valid result with all fields", () => {
    const result: IssueToFixResult = {
      issueNumber: 42,
      issueUrl: "https://github.com/owner/repo/issues/42",
      prNumber: 43,
      prUrl: "https://github.com/owner/repo/pull/43",
      summary: "Created issue and PR",
      success: true,
    };

    const parsed = IssueToFixResultSchema.parse(result);
    expect(parsed).toEqual(result);
  });

  it("should accept null for optional nullable fields", () => {
    const result: IssueToFixResult = {
      issueNumber: null,
      issueUrl: null,
      prNumber: null,
      prUrl: null,
      summary: "Failed to create issue",
      success: false,
    };

    const parsed = IssueToFixResultSchema.parse(result);
    expect(parsed).toEqual(result);
  });

  it("should require summary", () => {
    const result = {
      issueNumber: 42,
      issueUrl: "url",
      prNumber: null,
      prUrl: null,
      success: true,
    };

    expect(() => IssueToFixResultSchema.parse(result)).toThrow();
  });

  it("should require success boolean", () => {
    const result = {
      issueNumber: 42,
      issueUrl: "url",
      prNumber: null,
      prUrl: null,
      summary: "Done",
    };

    expect(() => IssueToFixResultSchema.parse(result)).toThrow();
  });
});