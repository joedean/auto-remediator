# Auto-Remediator

An automated code remediation tool that discovers errors from logs, analyzes root causes, and creates GitHub issues with AI-suggested fixes—optionally assigning Copilot to generate pull requests.

## Quick Start

Get up and running in 5 minutes:

```bash
# 1. Clone and install
git clone git@github.com:RealPage/auto-remediator.git
cd auto-remediator
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your API keys (see Configuration below)

# 3. Verify setup
pnpm typecheck && pnpm test:run

# 4. Run a demo
pnpm tsx --env-file=.env src/demo.ts
```

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 22+ | Required for ES modules support |
| pnpm | Latest | `npm install -g pnpm` |
| OpenAI API Key | - | [Get one here](https://platform.openai.com/api-keys) |
| GitHub PAT | - | [Create token](https://github.com/settings/tokens) with `repo` scope |
| GitHub MCP Server | - | See [Setup Instructions](#github-mcp-server-setup) below |

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Required
OPENAI_API_KEY=sk-...                           # Your OpenAI API key
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_...            # GitHub PAT with repo scope
GITHUB_MCP_SERVER_PATH=~/github-mcp/github-mcp-server  # Path to MCP binary

# Optional - defaults shown
LOG_LEVEL=info                                  # debug | info | warn | error
DRY_RUN=false                                   # true to preview without changes

# For Elastic integration (optional)
GITHUB_OWNER=your-org                           # Default GitHub org
GITHUB_REPO=your-repo                           # Default GitHub repo
ELASTIC_SPACE=your-space                        # Elastic space name
ELASTIC_SERVICE_NAME=your-service               # Service to query logs for
```

### GitHub MCP Server Setup

The GitHub MCP server provides tool access for creating issues and assigning Copilot.

```bash
# Option 1: Download pre-built binary
mkdir -p ~/github-mcp
# Download from https://github.com/github/github-mcp-server/releases
# Place binary at ~/github-mcp/github-mcp-server

# Option 2: Build from source
git clone https://github.com/github/github-mcp-server.git ~/github-mcp-src
cd ~/github-mcp-src
go build -o ~/github-mcp/github-mcp-server

# Make executable
chmod +x ~/github-mcp/github-mcp-server
```

## Development Commands

```bash
pnpm dev          # Run with hot reload (tsx watch)
pnpm build        # Compile TypeScript to dist/
pnpm start        # Run compiled code

pnpm test         # Run tests in watch mode
pnpm test:run     # Run tests once (CI mode)

pnpm typecheck    # TypeScript type checking
pnpm lint         # Run ESLint
pnpm lint:fix     # Auto-fix linting issues
pnpm format       # Format with Prettier
```

## Demo Scripts

Validate your setup and explore features:

```bash
# Basic error triage (no external dependencies)
pnpm tsx --env-file=.env src/demo.ts

# GitHub MCP connection test
pnpm tsx --env-file=.env src/demo-github-mcp.ts

# Issue-to-fix workflow (creates real GitHub issues!)
pnpm tsx --env-file=.env src/demo-issue-to-fix.ts

# Full remediation workflow (requires Elastic access)
pnpm tsx --env-file=.env src/demo-remediation.ts
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Remediation Workflow                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │   Elastic    │───▶│   Error      │───▶│   Triage + Root      │  │
│  │   Logs       │    │   Discovery  │    │   Cause Analysis     │  │
│  └──────────────┘    └──────────────┘    └──────────────────────┘  │
│                                                    │                │
│                                                    ▼                │
│                      ┌──────────────┐    ┌──────────────────────┐  │
│                      │   Copilot    │◀───│   GitHub Issue       │  │
│                      │   Assignment │    │   Creation           │  │
│                      └──────────────┘    └──────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Core Agents

| Agent | File | Purpose |
|-------|------|---------|
| **Triage Agent** | `src/agents/triage-agent.ts` | Classifies errors by category and severity |
| **Error Discovery** | `src/agents/error-discovery-agent.ts` | Finds unique errors from Elastic via ES\|QL |
| **Root Cause** | `src/agents/root-cause-agent.ts` | Analyzes causes, suggests fixes |
| **Issue-to-Fix** | `src/agents/issue-to-fix-agent.ts` | Creates issues, assigns Copilot |
| **Remediation Workflow** | `src/agents/remediation-workflow.ts` | Orchestrates full pipeline |

### MCP Integrations

| Client | File | Purpose |
|--------|------|---------|
| **GitHub MCP** | `src/mcp/github-mcp-client.ts` | Issue creation, Copilot assignment |
| **Elastic MCP** | `src/mcp/elastic-mcp-client.ts` | Log queries, error discovery |

## Project Structure

```
src/
├── agents/                    # AI agent implementations
│   ├── triage-agent.ts        # Error classification
│   ├── error-discovery-agent.ts
│   ├── root-cause-agent.ts
│   ├── issue-to-fix-agent.ts
│   ├── remediation-workflow.ts
│   └── prompts/               # Agent system prompts
├── mcp/                       # MCP client integrations
│   ├── github-mcp-client.ts
│   └── elastic-mcp-client.ts
├── types/                     # TypeScript types + Zod schemas
│   ├── triage.ts
│   └── remediation.ts
├── demo*.ts                   # Demo scripts
└── index.ts                   # Public API exports
```

## Usage Examples

### Error Triage

```typescript
import { triageError } from "auto-remediator";

const result = await triageError({
  errorMessage: "TypeError: Cannot read property 'email' of undefined",
  stackTrace: "at UserService.getUser (src/services/user.ts:42)",
  context: { endpoint: "/api/users" },
});

// result: { category: "type", severity: "high", suggestedFixes: [...] }
```

### Issue-to-Fix Workflow

```typescript
import { runIssueToFixWorkflow } from "auto-remediator";

const result = await runIssueToFixWorkflow({
  owner: "your-org",
  repo: "your-repo",
  title: "Add retry logic to API client",
  description: "The API client should retry failed requests",
});

// Creates GitHub issue and assigns Copilot to generate a PR
```

### Full Remediation Workflow

```typescript
import { runRemediationWorkflow } from "auto-remediator";

const result = await runRemediationWorkflow({
  elasticSpace: "your-space",
  serviceName: "your-service",
  timeWindow: "24h",
  githubOwner: "your-org",
  githubRepo: "your-repo",
  dryRun: true, // Preview without creating issues
});

// Discovers errors → analyzes → creates issues → assigns Copilot
```

## Contributing

### Adding a New Agent

1. Create agent file in `src/agents/`
2. Define Zod schemas for input/output in `src/types/`
3. Export from `src/index.ts`
4. Add tests in `src/__tests__/`
5. Add demo script if applicable

### Code Style

- Use functional patterns where practical
- Prefer `const` over `let`; avoid `var`
- Explicit return types on all functions
- Use Zod for runtime validation of external inputs
- Handle errors explicitly—no silent catches

### Running Tests

```bash
# Watch mode during development
pnpm test

# Single run for CI
pnpm test:run

# With coverage
pnpm test:run --coverage
```

## Troubleshooting

### "GitHub MCP server not found"

Ensure `GITHUB_MCP_SERVER_PATH` points to the executable:

```bash
ls -la ~/github-mcp/github-mcp-server
# Should show executable file

# If missing, download or build it (see Setup above)
```

### "OpenAI API error"

Check your API key is valid and has credits:

```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### "GITHUB_PERSONAL_ACCESS_TOKEN not set"

Create a token at https://github.com/settings/tokens with `repo` scope, then add to `.env`.

### Tests failing with module errors

Ensure you're on Node.js 22+:

```bash
node --version  # Should be v22.x.x or higher
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript (strict mode) |
| Runtime | Node.js 22+ |
| AI Framework | OpenAI Agent SDK |
| Protocol | Model Context Protocol (MCP) |
| Validation | Zod |
| Testing | Vitest |
| Linting | ESLint + Prettier |

## License

MIT
