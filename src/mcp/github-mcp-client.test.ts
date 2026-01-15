import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getGitHubToken,
  getGitHubMCPServerPath,
  createGitHubMCPServer,
  GitHubMCPClient,
  createGitHubMCPClient,
  IssueToFixInputSchema,
} from "./github-mcp-client.js";

// Mock the MCP SDK
const mockConnect = vi.fn();
const mockClose = vi.fn();
const mockListPrompts = vi.fn();
const mockGetPrompt = vi.fn();
const mockListTools = vi.fn();
const mockCallTool = vi.fn();

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class MockClient {
    name: string;
    version: string;

    constructor(config: { name: string; version: string }) {
      this.name = config.name;
      this.version = config.version;
    }

    connect = mockConnect;
    close = mockClose;
    listPrompts = mockListPrompts;
    getPrompt = mockGetPrompt;
    listTools = mockListTools;
    callTool = mockCallTool;
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: class MockStdioClientTransport {
    command: string;
    args: string[];
    env: Record<string, string>;

    constructor(config: {
      command: string;
      args: string[];
      env: Record<string, string>;
    }) {
      this.command = config.command;
      this.args = config.args;
      this.env = config.env;
    }
  },
}));

// Mock the OpenAI agents SDK
vi.mock("@openai/agents", () => ({
  MCPServerStdio: class MockMCPServerStdio {
    command: string;
    args: string[];
    env: Record<string, string>;

    constructor(config: {
      command: string;
      args: string[];
      env: Record<string, string>;
    }) {
      this.command = config.command;
      this.args = config.args;
      this.env = config.env;
    }
  },
}));

describe("getGitHubToken", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return token when set", () => {
    process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] = "test-token-123";

    const result = getGitHubToken();

    expect(result).toBe("test-token-123");
  });

  it("should throw error when token is not set", () => {
    delete process.env["GITHUB_PERSONAL_ACCESS_TOKEN"];

    expect(() => getGitHubToken()).toThrow(
      "GITHUB_PERSONAL_ACCESS_TOKEN environment variable is required"
    );
  });

  it("should throw error when token is empty string", () => {
    process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] = "";

    expect(() => getGitHubToken()).toThrow(
      "GITHUB_PERSONAL_ACCESS_TOKEN environment variable is required"
    );
  });
});

describe("getGitHubMCPServerPath", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return path when set", () => {
    process.env["GITHUB_MCP_SERVER_PATH"] = "/usr/local/bin/github-mcp-server";

    const result = getGitHubMCPServerPath();

    expect(result).toBe("/usr/local/bin/github-mcp-server");
  });

  it("should expand ~ to HOME directory", () => {
    process.env["GITHUB_MCP_SERVER_PATH"] = "~/github-mcp/github-mcp-server";
    process.env["HOME"] = "/Users/testuser";

    const result = getGitHubMCPServerPath();

    expect(result).toBe("/Users/testuser/github-mcp/github-mcp-server");
  });

  it("should handle empty HOME when expanding ~", () => {
    process.env["GITHUB_MCP_SERVER_PATH"] = "~/github-mcp/github-mcp-server";
    delete process.env["HOME"];

    const result = getGitHubMCPServerPath();

    expect(result).toBe("/github-mcp/github-mcp-server");
  });

  it("should throw error when path is not set", () => {
    delete process.env["GITHUB_MCP_SERVER_PATH"];

    expect(() => getGitHubMCPServerPath()).toThrow(
      "GITHUB_MCP_SERVER_PATH environment variable is required"
    );
  });

  it("should throw error when path is empty string", () => {
    process.env["GITHUB_MCP_SERVER_PATH"] = "";

    expect(() => getGitHubMCPServerPath()).toThrow(
      "GITHUB_MCP_SERVER_PATH environment variable is required"
    );
  });
});

describe("createGitHubMCPServer", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] = "test-token";
    process.env["GITHUB_MCP_SERVER_PATH"] = "/path/to/server";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should create MCPServerStdio with correct config", () => {
    const server = createGitHubMCPServer();

    expect(server).toBeDefined();
    expect((server as { command: string }).command).toBe("/path/to/server");
    expect((server as { args: string[] }).args).toEqual(["stdio"]);
    expect((server as { env: Record<string, string> }).env).toEqual({
      GITHUB_PERSONAL_ACCESS_TOKEN: "test-token",
      GITHUB_TOOLSETS: "all",
    });
  });

  it("should throw if token is missing", () => {
    delete process.env["GITHUB_PERSONAL_ACCESS_TOKEN"];

    expect(() => createGitHubMCPServer()).toThrow(
      "GITHUB_PERSONAL_ACCESS_TOKEN environment variable is required"
    );
  });

  it("should throw if path is missing", () => {
    delete process.env["GITHUB_MCP_SERVER_PATH"];

    expect(() => createGitHubMCPServer()).toThrow(
      "GITHUB_MCP_SERVER_PATH environment variable is required"
    );
  });
});

describe("GitHubMCPClient", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] = "test-token";
    process.env["GITHUB_MCP_SERVER_PATH"] = "/path/to/server";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("constructor", () => {
    it("should create client with correct configuration", () => {
      const client = new GitHubMCPClient();

      expect(client).toBeDefined();
    });

    it("should throw if token is missing", () => {
      delete process.env["GITHUB_PERSONAL_ACCESS_TOKEN"];

      expect(() => new GitHubMCPClient()).toThrow(
        "GITHUB_PERSONAL_ACCESS_TOKEN environment variable is required"
      );
    });
  });

  describe("connect", () => {
    it("should call client.connect with transport", async () => {
      mockConnect.mockResolvedValueOnce(undefined);

      const client = new GitHubMCPClient();
      await client.connect();

      expect(mockConnect).toHaveBeenCalledOnce();
    });
  });

  describe("close", () => {
    it("should call client.close", async () => {
      mockClose.mockResolvedValueOnce(undefined);

      const client = new GitHubMCPClient();
      await client.close();

      expect(mockClose).toHaveBeenCalledOnce();
    });
  });

  describe("listPrompts", () => {
    it("should return prompts from MCP server", async () => {
      const mockPrompts = [
        { name: "prompt1", description: "First prompt" },
        { name: "prompt2", description: "Second prompt" },
      ];
      mockListPrompts.mockResolvedValueOnce({ prompts: mockPrompts });

      const client = new GitHubMCPClient();
      const result = await client.listPrompts();

      expect(result).toEqual(mockPrompts);
      expect(mockListPrompts).toHaveBeenCalledOnce();
    });
  });

  describe("getPrompt", () => {
    it("should call getPrompt with name and arguments", async () => {
      const mockResult = { messages: [{ role: "user", content: "test" }] };
      mockGetPrompt.mockResolvedValueOnce(mockResult);

      const client = new GitHubMCPClient();
      const result = await client.getPrompt("test_prompt", { arg1: "value1" });

      expect(result).toEqual(mockResult);
      expect(mockGetPrompt).toHaveBeenCalledWith({
        name: "test_prompt",
        arguments: { arg1: "value1" },
      });
    });
  });

  describe("getIssueToFixPrompt", () => {
    it("should call getPrompt with issue_to_fix_workflow and input", async () => {
      const mockResult = { messages: [] };
      mockGetPrompt.mockResolvedValueOnce(mockResult);

      const client = new GitHubMCPClient();
      const result = await client.getIssueToFixPrompt({
        owner: "my-org",
        repo: "my-repo",
        title: "Fix bug",
        description: "Bug description",
      });

      expect(result).toEqual(mockResult);
      expect(mockGetPrompt).toHaveBeenCalledWith({
        name: "issue_to_fix_workflow",
        arguments: {
          owner: "my-org",
          repo: "my-repo",
          title: "Fix bug",
          description: "Bug description",
        },
      });
    });
  });

  describe("listTools", () => {
    it("should return tools from MCP server", async () => {
      const mockTools = [
        { name: "tool1", description: "First tool" },
        { name: "tool2", description: "Second tool" },
      ];
      mockListTools.mockResolvedValueOnce({ tools: mockTools });

      const client = new GitHubMCPClient();
      const result = await client.listTools();

      expect(result).toEqual(mockTools);
      expect(mockListTools).toHaveBeenCalledOnce();
    });
  });

  describe("callTool", () => {
    it("should call tool with name and arguments", async () => {
      const mockResult = { content: [{ type: "text", text: "result" }] };
      mockCallTool.mockResolvedValueOnce(mockResult);

      const client = new GitHubMCPClient();
      const result = await client.callTool("create_issue", {
        owner: "org",
        repo: "repo",
        title: "Issue",
      });

      expect(result).toEqual(mockResult);
      expect(mockCallTool).toHaveBeenCalledWith({
        name: "create_issue",
        arguments: {
          owner: "org",
          repo: "repo",
          title: "Issue",
        },
      });
    });
  });
});

describe("createGitHubMCPClient", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] = "test-token";
    process.env["GITHUB_MCP_SERVER_PATH"] = "/path/to/server";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should create and connect client", async () => {
    mockConnect.mockResolvedValueOnce(undefined);

    const client = await createGitHubMCPClient();

    expect(client).toBeInstanceOf(GitHubMCPClient);
    expect(mockConnect).toHaveBeenCalledOnce();
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

  it("should require all fields", () => {
    expect(() => IssueToFixInputSchema.parse({})).toThrow();
    expect(() =>
      IssueToFixInputSchema.parse({ owner: "org" })
    ).toThrow();
    expect(() =>
      IssueToFixInputSchema.parse({ owner: "org", repo: "repo" })
    ).toThrow();
    expect(() =>
      IssueToFixInputSchema.parse({
        owner: "org",
        repo: "repo",
        title: "title",
      })
    ).toThrow();
  });

  it("should reject non-string values", () => {
    expect(() =>
      IssueToFixInputSchema.parse({
        owner: 123,
        repo: "repo",
        title: "title",
        description: "desc",
      })
    ).toThrow();
  });
});
