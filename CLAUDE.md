# Auto-Remediator Project

## Project Overview
An automated code remediation tool that analyzes error logs, identifies broken code, and applies fixes using AI-powered agents built with TypeScript and OpenAI's Agent SDK.

## Tech Stack
- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js 20+
- **AI Framework**: OpenAI Agent SDK
- **Package Manager**: pnpm (preferred) or npm
- **Testing**: Vitest
- **Linting**: ESLint + Prettier

## Project Structure
```
src/
├── agents/           # OpenAI agent definitions
├── parsers/          # Log parsing utilities
├── analyzers/        # Code analysis logic
├── remediators/      # Fix generation and application
├── types/            # TypeScript type definitions
├── utils/            # Shared utilities
└── index.ts          # Main entry point
```

## Code Style Guidelines
- Use functional programming patterns where practical
- Prefer `const` over `let`; avoid `var`
- Use explicit return types on all functions
- Keep functions small and single-purpose
- Use descriptive variable names (no abbreviations)
- Handle errors explicitly—no silent catches
- Use Zod for runtime validation of external inputs

## Agent Design Principles
- Each agent should have a single, well-defined responsibility
- Use tool definitions for discrete actions (parse, analyze, fix, validate)
- Include clear system prompts that constrain agent behavior
- Implement guardrails to prevent destructive operations
- Log all agent decisions for observability

## Commands
```bash
pnpm dev          # Run in development mode
pnpm build        # Build for production
pnpm test         # Run tests
pnpm lint         # Run linter
pnpm typecheck    # TypeScript type checking
```

## Environment Variables
```
OPENAI_API_KEY=       # Required: OpenAI API key
LOG_LEVEL=info        # Optional: debug, info, warn, error
DRY_RUN=false         # Optional: preview fixes without applying
```

## Key Patterns

### Error Handling
```typescript
// Use Result types for operations that can fail
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
```

### Agent Tool Definition
```typescript
// Tools should be pure functions with clear input/output schemas
const tool = {
  name: "analyze_error",
  description: "Analyzes an error log entry to identify root cause",
  parameters: z.object({
    errorMessage: z.string(),
    stackTrace: z.string().optional(),
    context: z.record(z.unknown()).optional(),
  }),
};
```

## Testing Requirements
- Unit tests for all parsers and analyzers
- Integration tests for agent workflows
- Mock OpenAI responses in tests (don't hit real API)
- Test edge cases: malformed logs, unrecognized errors, etc.

## Safety Guardrails
- Never auto-apply fixes to production without human approval
- Validate all generated code before application
- Maintain rollback capability for all changes
- Rate limit API calls to prevent runaway costs
- Log all remediation attempts with before/after state

## Current Focus
<!-- Update this section as priorities shift -->
- [ ] Initial project setup and scaffolding
- [ ] Log parser for common error formats
- [ ] Basic agent workflow for error analysis
- [ ] Fix generation with validation

## Notes for Claude
- When generating agent code, include comprehensive error handling
- Prefer streaming responses for long-running operations
- Always validate external inputs with Zod schemas
- Include JSDoc comments on public APIs
- When in doubt, ask clarifying questions about requirements