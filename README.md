# @thani-sh/duct-tape

An LLM-backed self-healing execution and code compiler loop. It takes initial instructions, generates code via an LLM, executes it inside an isolated sandbox, and on failure, automatically packages the error along with debugging context and prompts the LLM to self-correct the code dynamically, repeating until success or a maximum retry limit.

## Installation

```bash
bun add @thani-sh/duct-tape
# or
npm install @thani-sh/duct-tape
```

## Quick Start (Functional Wrapper)

The functional wrapper is the easiest way to orchestrate the self-healing loop.

```typescript
import {
  runSelfHealingLoop,
  NodeVMSandbox,
  type LLMAdapter,
} from "@thani-sh/duct-tape";

// 1. Configure your LLM Adapter (supporting standard LLM APIs or Vercel AI SDK)
const llm: LLMAdapter = {
  prompt: async (messages) => {
    // Call your LLM API here and return response text or stream chunks
    const response = await fetchLLMResponse(messages);
    return response.text;
  },
};

// 2. Initialize the out-of-the-box isolated sandbox executor
const executor = new NodeVMSandbox({
  // inject global objects or mocks into sandbox context
  checkValue: (x: number) => x * 2,
});

// 3. Start self-healing compilation loop
const result = await runSelfHealingLoop(
  "Generate code that takes the global value 10, runs checkValue on it, and returns the result.",
  {
    llm,
    executor,
    maxRetries: 3,
    onRetry: ({ retryCount, error }) => {
      console.warn(`Retry #${retryCount} failed:`, error);
    },
    onSuccess: ({ finalCode }) => {
      console.log("Success! Final healed code:\n", finalCode);
    },
  },
);
```

## Advanced Usage (OOP Architecture)

Under the hood, `@thani-sh/duct-tape` follows SOLID principles. You can use the `SelfHealingLoop` orchestrator with custom `CodeExecutor` implementations (e.g. running code in Docker containers, Web Workers, or browsers).

### Custom Code Executor

```typescript
import {
  SelfHealingLoop,
  type CodeExecutor,
  type SandboxResult,
  type LLMAdapter,
} from "@thani-sh/duct-tape";

// Implement the CodeExecutor interface
class DockerExecutor implements CodeExecutor<string> {
  async execute(code: string): Promise<SandboxResult<string>> {
    try {
      const output = await runCodeInDocker(code);
      return { success: true, context: output };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err : new Error(String(err)),
        context: "Stderr logs or container status",
      };
    }
  }
}

const loop = new SelfHealingLoop(llm, new DockerExecutor());
const result = await loop.run("Generate script to query container status");
```

## API Reference

### `SelfHealingLoop`

The core orchestrator of the conversation and execution feedback loop.

- `constructor(llm, executor, options)`
- `run(initialPrompt): Promise<Result>`

### `NodeVMSandbox`

A concrete `CodeExecutor` running code inside Node's native isolated `vm` module.

- `constructor(globals)`: injects variables/functions into the context.
- `execute(code): Promise<SandboxResult>`

### `CodeExecutor`

Interface defining sandboxed execution.

```typescript
export interface CodeExecutor<TContext = unknown> {
  execute(code: string): Promise<SandboxResult<TContext>>;
}
```

### `runSelfHealingLoop(initialPrompt, options)`

A functional helper wrapping `SelfHealingLoop` for quick integration.

## Development

```bash
# Install dependencies
bun install

# Run tests
bun run test

# Run linter
bun run lint

# Build the package
bun run build
```

## License

MIT
