import { expect, test } from "bun:test";
import { NodeVMSandbox } from "./sandbox.js";
import { SelfHealingLoop } from "./healer.js";
import type { LLMAdapter, LLMMessage, SandboxResult } from "./types.js";

test("NodeVMSandbox executes code successfully", async () => {
  const sandbox = new NodeVMSandbox({ value: 10 });
  const result = await sandbox.execute("value * 2;");

  expect(result.success).toBe(true);
  expect(result.context).toBe(20);
});

test("NodeVMSandbox catches syntax and runtime errors", async () => {
  const sandbox = new NodeVMSandbox();
  const result = await sandbox.execute("nonExistentVariable.method();");

  expect(result.success).toBe(false);
  expect(result.error).toBeInstanceOf(Error);
});

test("SelfHealingLoop succeeds on first attempt", async () => {
  const mockLLM: LLMAdapter = {
    prompt: async () => "const x = 5; x + 5;",
  };

  const mockExecutor = {
    execute: async (code: string): Promise<SandboxResult<unknown>> => {
      expect(code).toBe("const x = 5; x + 5;");
      return { success: true, context: 10 };
    },
  };

  const loop = new SelfHealingLoop(mockLLM, mockExecutor);
  const result = await loop.run("Generate code to sum 5 and 5");

  expect(result.success).toBe(true);
  expect(result.finalCode).toBe("const x = 5; x + 5;");
  expect(result.error).toBeUndefined();
});

test("SelfHealingLoop self-heals after validation failure", async () => {
  let promptCount = 0;
  const mockLLM: LLMAdapter = {
    prompt: async () => {
      promptCount++;
      if (promptCount === 1) {
        return "const x = 5; x + 3;";
      }
      return "const x = 5; x + 5;";
    },
  };

  let executeCount = 0;
  const mockExecutor = {
    execute: async (code: string): Promise<SandboxResult<unknown>> => {
      executeCount++;
      if (executeCount === 1) {
        expect(code).toBe("const x = 5; x + 3;");
        return {
          success: false,
          error: new Error("Expected sum to be 10, got 8"),
        };
      }
      expect(code).toBe("const x = 5; x + 5;");
      return { success: true, context: 10 };
    },
  };

  const loop = new SelfHealingLoop(mockLLM, mockExecutor, { maxRetries: 2 });
  const result = await loop.run("Generate code to sum 5 and 5");

  expect(result.success).toBe(true);
  expect(result.finalCode).toBe("const x = 5; x + 5;");
  expect(result.error).toBeUndefined();
  expect(promptCount).toBe(2);
  expect(executeCount).toBe(2);
});
