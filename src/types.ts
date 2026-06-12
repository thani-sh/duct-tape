/**
 * SandboxResult represents the outcome of executing code inside a test environment.
 */
export interface SandboxResult<TContext = unknown> {
  success: boolean;
  error?: Error;
  context?: TContext;
}

/**
 * CodeExecutor defines the interface for running code in a sandbox.
 */
export interface CodeExecutor<TContext = unknown> {
  /**
   * execute runs the given JavaScript code string and returns the execution result.
   */
  execute(code: string): Promise<SandboxResult<TContext>>;
}

/**
 * LLMMessage represents a single chat turn in the conversation with the LLM.
 */
export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string | unknown[];
}

/**
 * LLMAdapter abstracts the AI model prompt/chat interface.
 */
export interface LLMAdapter {
  prompt: (
    messages: LLMMessage[],
  ) => Promise<string> | AsyncGenerator<string, void>;
}

/**
 * SelfHealingOptions configures the self-healing compilation loop.
 */
export interface SelfHealingOptions<TContext = unknown> {
  /**
   * llm is the LLM adapter used to generate and correct code.
   */
  llm: LLMAdapter;

  /**
   * executor is the sandboxed environment (or function) used to execute and validate code.
   */
  executor:
    | CodeExecutor<TContext>
    | ((code: string) => Promise<SandboxResult<TContext>>);

  /**
   * maxRetries is the maximum number of healing retries before giving up. Defaults to 3.
   */
  maxRetries?: number;

  /**
   * systemPrompt represents custom instructions for the AI model.
   */
  systemPrompt?: string;

  /**
   * buildHealerPrompt is a custom function to construct the correction prompt sent to the LLM on execution failures.
   */
  buildHealerPrompt?: (params: {
    code: string;
    error: string;
    context?: TContext;
  }) => string;

  /**
   * onRetry is a callback fired on each self-healing retry attempt.
   */
  onRetry?: (params: {
    retryCount: number;
    code: string;
    error: string;
    context?: TContext;
  }) => void;

  /**
   * onSuccess is a callback fired when code succeeds validation.
   */
  onSuccess?: (params: { retryCount: number; finalCode: string }) => void;

  /**
   * onFailure is a callback fired when code fails validation after max retries.
   */
  onFailure?: (params: { finalCode: string; error: string }) => void;
}
