# Advanced Usage & API Reference

Welcome to the advanced usage guide for `duct-tape`. This document covers deep-dives into the library's capabilities, custom code executors, advanced configurations, and the complete API reference.

---

## Architecture Overview

`duct-tape` is built around SOLID principles, allowing you to customize how code is generated, executed, and healed. The core orchestration is handled by the `SelfHealingLoop` class, which interacts with two main abstractions:

1. **`LLMAdapter`**: Responsible for communicating with the language model to generate and correct code.
2. **`CodeExecutor`**: Responsible for executing the generated code inside an environment (sandbox, container, browser, etc.) and returning validation feedback.

```mermaid
sequenceDiagram
    participant User/System
    participant Loop as SelfHealingLoop
    participant LLM as LLMAdapter
    participant Exec as CodeExecutor

    User/System->>Loop: run(prompt)
    Loop->>LLM: generateCode(prompt)
    LLM-->>Loop: code
    loop Execution & Healing Loop (up to maxRetries)
        Loop->>Exec: execute(code)
        Exec-->>Loop: SandboxResult (success/error/context)
        alt success == true
            Loop-->>User/System: success (finalCode)
        else success == false and try < maxRetries
            Loop->>LLM: healCode(code, error, context)
            LLM-->>Loop: newCode
        else try == maxRetries
            Loop-->>User/System: failure (finalCode, error)
        end
    end
```

---

## Custom Code Executors

While `duct-tape` comes out-of-the-box with `NodeVMSandbox` (using Node.js's native `vm` module), you can implement the `CodeExecutor` interface to run code in any isolated environment (e.g., Docker, Web Workers, browser sandboxes, or remote execution servers).

### Docker Executor Example

Here is an example of a custom code executor that runs JavaScript code in an isolated Docker container:

```typescript
import {
  SelfHealingLoop,
  type CodeExecutor,
  type SandboxResult,
  type LLMAdapter,
} from "@thani-sh/duct-tape";

// 1. Implement the CodeExecutor interface
class DockerExecutor implements CodeExecutor<string> {
  async execute(code: string): Promise<SandboxResult<string>> {
    try {
      // Custom logic to spin up a container and run the code
      const output = await runCodeInDocker(code);
      return { success: true, context: output };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err : new Error(String(err)),
        context: "Docker container stderr logs/status",
      };
    }
  }
}

// 2. Define your LLM prompt implementation
const llm: LLMAdapter = {
  prompt: async (messages) => {
    // Call your LLM API of choice...
    return "/* generated code */";
  },
};

// 3. Instantiate and run the loop
const loop = new SelfHealingLoop(llm, new DockerExecutor());
const result = await loop.run(
  "Generate a script to check container storage usage.",
);
```

---

## API Reference

### Core Orchestrator

#### `SelfHealingLoop<TContext = unknown>`

The main class that manages the generation, execution, and correction feedback loop.

- **`constructor(llm, executor, options?)`**
  - `llm`: `LLMAdapter`
  - `executor`: `CodeExecutor<TContext> | ((code: string) => Promise<SandboxResult<TContext>>)`
  - `options`: `Omit<SelfHealingOptions<TContext>, "llm" | "executor">`

- **`run(initialPrompt: string): Promise<Result>`**
  - Executes the self-healing feedback loop starting with the initial prompt.
  - Returns `Promise<{ success: boolean; finalCode: string; error?: string }>`

---

### Executing & Sandboxing

#### `NodeVMSandbox`

A concrete `CodeExecutor` that executes code inside Node's native isolated `vm` module.

- **`constructor(globals?: Record<string, unknown>)`**
  - `globals`: Object containing variables, utilities, or mocks to inject into the sandbox's global context (e.g., database clients, assertion helpers, or mock APIs).
- **`execute(code: string): Promise<SandboxResult<unknown>>`**
  - Runs the code in the context and catches any compilation or execution errors.

#### `compileCodeToFunction<TResult, TArgs>(codeStr, globals?)`

Compiles a string containing a JavaScript function expression into an executable in-memory function using Node's native `vm` module. Useful for cases where you need to repeatedly call the generated code with different arguments.

```typescript
import { compileCodeToFunction } from "@thani-sh/duct-tape";

const fn = compileCodeToFunction<number, [number, number]>(
  "async (a, b) => a + b",
);
const sum = await fn(5, 7); // 12
```

---

### Interfaces & Types

#### `CodeExecutor<TContext = unknown>`

Interface defining a sandboxed execution environment.

```typescript
export interface CodeExecutor<TContext = unknown> {
  execute(code: string): Promise<SandboxResult<TContext>>;
}
```

#### `SandboxResult<TContext = unknown>`

Represents the outcome of executing code inside an executor.

```typescript
export interface SandboxResult<TContext = unknown> {
  success: boolean;
  error?: Error;
  context?: TContext; // Additional debugging context (e.g. stdout, stderr, logs)
}
```

#### `LLMAdapter`

Abstracts the LLM API. The `prompt` method can return a plain string or yield chunks via an async generator.

```typescript
export interface LLMAdapter {
  prompt: (
    messages: LLMMessage[],
  ) => Promise<string> | AsyncGenerator<string, void>;
}
```

#### `LLMMessage`

A message representation for chat models.

```typescript
export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string | unknown[];
}
```

#### `SelfHealingOptions<TContext = unknown>`

Configuration options for the self-healing compilation loop.

| Option              | Type                       | Default                                             | Description                                                      |
| :------------------ | :------------------------- | :-------------------------------------------------- | :--------------------------------------------------------------- |
| `llm`               | `LLMAdapter`               | _Required_                                          | LLM adapter used to generate and correct code.                   |
| `executor`          | `CodeExecutor \| Function` | _Required_                                          | Executor environment or callback function to run/validate code.  |
| `maxRetries`        | `number`                   | `3`                                                 | Maximum number of healing retry iterations.                      |
| `systemPrompt`      | `string`                   | `"You are a code generation agent. Output ONLY..."` | System instructions for the model.                               |
| `buildHealerPrompt` | `Function`                 | _Default Template_                                  | Custom builder for the healing prompt when code execution fails. |
| `onRetry`           | `Function`                 | `undefined`                                         | Callback fired on each self-healing retry attempt.               |
| `onSuccess`         | `Function`                 | `undefined`                                         | Callback fired when code execution succeeds.                     |
| `onFailure`         | `Function`                 | `undefined`                                         | Callback fired when validation fails after all retries.          |

##### Callback Details

- **`onRetry`**:
  ```typescript
  onRetry?: (params: {
    retryCount: number;
    code: string;
    error: string;
    context?: TContext;
  }) => void;
  ```
- **`onSuccess`**:
  ```typescript
  onSuccess?: (params: {
    retryCount: number;
    finalCode: string;
  }) => void;
  ```
- **`onFailure`**:
  ```typescript
  onFailure?: (params: {
    finalCode: string;
    error: string;
  }) => void;
  ```
- **`buildHealerPrompt`**:
  ```typescript
  buildHealerPrompt?: (params: {
    code: string;
    error: string;
    context?: TContext;
  }) => string;
  ```

---

### Utility Helpers

#### `cleanCode(code: string): string`

Strips markdown code blocks (e.g. ` ```javascript ` and ` ``` `) or backticks from generated code snippets, leaving only the raw, executable JS code.

---

## Development

If you are contributing to or working on `@thani-sh/duct-tape`, here are the common commands used for development (using `bun`):

```bash
# Install dependencies
bun install

# Run tests
bun test

# Run linter checks
bun run lint

# Automatically fix linting issues
bun run lint:fix

# Build the project (TypeScript compilation to dist/)
bun run build
```
