import vm from "node:vm";
import { type CodeExecutor, type SandboxResult } from "./types.js";

/**
 * NodeVMSandbox executes a JavaScript code string inside an isolated Node.js vm context.
 */
export class NodeVMSandbox implements CodeExecutor<unknown> {
  /**
   * constructor initializes the sandbox with global variables to inject.
   */
  constructor(private readonly globals: Record<string, unknown> = {}) {}

  /**
   * execute compiles the given code string and runs it in the VM context, catching any execution errors.
   */
  async execute(code: string): Promise<SandboxResult<unknown>> {
    try {
      const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        Promise,
        Buffer,
        ...this.globals,
      };

      const context = vm.createContext(sandbox);
      const result = await vm.runInContext(code, context);

      return {
        success: true,
        context: result,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }
}

/**
 * compileCodeToFunction compiles a string containing a JavaScript function expression into an executable in-memory function using Node's native vm module.
 */
export function compileCodeToFunction<
  TResult = unknown,
  TArgs extends unknown[] = unknown[],
>(
  codeStr: string,
  globals: Record<string, unknown> = {},
): (...args: TArgs) => TResult {
  const trimmed = codeStr.trim();
  // Wrap in parentheses if it looks like an anonymous function expression to compile cleanly
  const wrappedCode =
    (trimmed.startsWith("async") || trimmed.startsWith("(")) &&
    !trimmed.startsWith("class")
      ? `(${trimmed})`
      : trimmed;

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    Buffer,
    ...globals,
  };

  const context = vm.createContext(sandbox);
  return vm.runInContext(wrappedCode, context) as (...args: TArgs) => TResult;
}
