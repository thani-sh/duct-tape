import type {
  CodeExecutor,
  LLMAdapter,
  LLMMessage,
  SandboxResult,
  SelfHealingOptions,
} from "./types.js";

/**
 * cleanCode strips markdown code blocks or backticks from generated code snippets.
 */
export function cleanCode(code: string): string {
  let cleaned = code.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n/, "");
    cleaned = cleaned.replace(/\n```$/, "");
  }
  return cleaned.trim();
}

/**
 * SelfHealingLoop orchestrates a code-generation and self-correcting loop using an LLM and an isolated executor environment.
 */
export class SelfHealingLoop<TContext = unknown> {
  private readonly executor: CodeExecutor<TContext>;

  /**
   * constructor initializes the self-healing loop with dependencies and configuration options.
   */
  constructor(
    private readonly llm: LLMAdapter,
    executor:
      | CodeExecutor<TContext>
      | ((code: string) => Promise<SandboxResult<TContext>>),
    private readonly options: Omit<
      SelfHealingOptions<TContext>,
      "llm" | "executor"
    > = {},
  ) {
    this.executor =
      typeof executor === "function" ? { execute: executor } : executor;
  }

  /**
   * run executes the self-healing process for a given query prompt.
   */
  async run(
    initialPrompt: string,
  ): Promise<{ success: boolean; finalCode: string; error?: string }> {
    const maxRetries = this.options.maxRetries ?? 3;
    const systemPrompt =
      this.options.systemPrompt ??
      "You are a code generation agent. Output ONLY the raw executable code without markdown fences or backticks. No explanation.";

    const conversationHistory: LLMMessage[] = [];
    if (systemPrompt) {
      conversationHistory.push({ role: "system", content: systemPrompt });
    }

    conversationHistory.push({ role: "user", content: initialPrompt });

    let currentCode = "";
    try {
      currentCode = await this.promptLLM(conversationHistory);
      conversationHistory.push({ role: "assistant", content: currentCode });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        finalCode: "",
        error: `LLM Generation Failed: ${errMsg}`,
      };
    }

    let tryCount = 0;
    let success = false;
    let lastErrorMsg = "";

    while (tryCount <= maxRetries && !success) {
      tryCount++;

      const testResult = await this.executor.execute(currentCode);

      if (testResult.success) {
        success = true;
        this.options.onSuccess?.({
          retryCount: tryCount - 1,
          finalCode: currentCode,
        });
        break;
      }

      const errMsg =
        testResult.error?.message ||
        String(testResult.error || "Unknown sandbox failure");
      lastErrorMsg = errMsg;

      if (tryCount > maxRetries) {
        this.options.onFailure?.({ finalCode: currentCode, error: errMsg });
        break;
      }

      this.options.onRetry?.({
        retryCount: tryCount,
        code: currentCode,
        error: errMsg,
        context: testResult.context,
      });

      const healerPrompt = this.options.buildHealerPrompt
        ? this.options.buildHealerPrompt({
            code: currentCode,
            error: errMsg,
            context: testResult.context,
          })
        : `The execution of your generated code failed during validation.\n\n` +
          `Here is the code you generated:\n` +
          `\`\`\`javascript\n${currentCode}\n\`\`\`\n\n` +
          `It threw the following error:\n` +
          `${errMsg}\n\n` +
          `Please analyze the error, resolve any bugs or selector issues, and output a corrected, robust version of the code. ` +
          `Remember: output ONLY raw executable code.`;

      conversationHistory.push({ role: "user", content: healerPrompt });

      try {
        currentCode = await this.promptLLM(conversationHistory);
        conversationHistory.push({ role: "assistant", content: currentCode });
      } catch (err) {
        const promptError = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          finalCode: currentCode,
          error: `LLM Healing Prompt Failed: ${promptError}`,
        };
      }
    }

    return {
      success,
      finalCode: currentCode,
      error: success ? undefined : lastErrorMsg,
    };
  }

  /**
   * promptLLM is an internal helper to request completions from the LLM adapter.
   */
  private async promptLLM(messages: LLMMessage[]): Promise<string> {
    const res = this.llm.prompt(messages);
    if (res && Symbol.asyncIterator in (res as object)) {
      let fullText = "";
      for await (const chunk of res as AsyncGenerator<string, void>) {
        fullText += chunk;
      }
      return cleanCode(fullText);
    } else {
      return cleanCode(await (res as Promise<string>));
    }
  }
}


