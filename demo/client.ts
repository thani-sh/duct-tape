import {
  SelfHealingLoop,
  type CodeExecutor,
  type SandboxResult,
  type LLMAdapter,
  type LLMMessage,
} from "@thani-sh/duct-tape";

class PipelineManager {
  private activeAttemptCard: HTMLDetailsElement | null = null;
  private activeAttemptContent: HTMLDivElement | null = null;
  private steps: Record<
    string,
    {
      element: HTMLDivElement;
      badge: HTMLSpanElement;
      details: HTMLDivElement;
      toggle: HTMLSpanElement;
    }
  > = {};

  startAttempt(num: number) {
    const consoleOutput = document.getElementById("consoleOutput");
    if (!consoleOutput) return;

    // Collapse previous attempt card if any
    if (this.activeAttemptCard) {
      this.activeAttemptCard.open = false;
      const summary = this.activeAttemptCard.querySelector("summary");
      if (summary && summary.innerText.includes("Running")) {
        summary.innerText = summary.innerText.replace("Running", "Failed");
        summary.style.color = "var(--error)";
      }
    }

    const details = document.createElement("details");
    details.open = true;
    details.className = "attempt-card";

    const summary = document.createElement("summary");
    summary.className = "attempt-summary";
    summary.innerText = `Generation Attempt #${num} (Running)`;
    summary.style.color = "var(--primary)";

    const content = document.createElement("div");
    content.className = "attempt-content";

    details.appendChild(summary);
    details.appendChild(content);
    consoleOutput.appendChild(details);

    this.activeAttemptCard = details;
    this.activeAttemptContent = content;
    this.steps = {};

    this.initializeStep("generation", "AI Code Design", "✨");
    this.initializeStep("execution", "Sandbox Rendering", "⚙️");
    this.initializeStep("vision", "Visual Quality Scan", "👁️");
    this.initializeStep("evaluation", "Match Evaluation", "⚖️");

    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }

  finalizeAttempt(status: "Succeeded" | "Failed") {
    if (!this.activeAttemptCard) return;
    const summary = this.activeAttemptCard.querySelector("summary");
    if (summary) {
      summary.innerText = summary.innerText.replace("Running", status);
      summary.style.color =
        status === "Succeeded" ? "var(--success)" : "var(--error)";
    }
    if (status === "Failed") {
      this.activeAttemptCard.open = false;
    }
  }

  private initializeStep(id: string, name: string, icon: string) {
    if (!this.activeAttemptContent) return;

    const stepDiv = document.createElement("div");
    stepDiv.className = "pipeline-step";

    // Indicator Dot
    const indicator = document.createElement("div");
    indicator.className = "step-indicator";
    stepDiv.appendChild(indicator);

    // Header
    const header = document.createElement("div");
    header.className = "step-header";

    const titleGroup = document.createElement("div");
    titleGroup.className = "step-title-group";

    const iconSpan = document.createElement("span");
    iconSpan.className = "icon";
    iconSpan.innerText = icon;

    const titleSpan = document.createElement("span");
    titleSpan.innerText = name;
    titleSpan.style.color = "var(--text)";

    titleGroup.appendChild(iconSpan);
    titleGroup.appendChild(titleSpan);

    const rightGroup = document.createElement("div");
    rightGroup.style.display = "flex";
    rightGroup.style.alignItems = "center";
    rightGroup.style.gap = "0.75rem";

    const badge = document.createElement("span");
    badge.className = "step-badge pending";
    badge.innerText = "Pending";

    const toggle = document.createElement("span");
    toggle.className = "step-details-toggle";
    toggle.innerText = "▶";
    toggle.style.display = "inline-block";
    toggle.style.visibility = "hidden"; // hidden until we have details

    rightGroup.appendChild(badge);
    rightGroup.appendChild(toggle);

    header.appendChild(titleGroup);
    header.appendChild(rightGroup);
    stepDiv.appendChild(header);

    // Details Body
    const details = document.createElement("div");
    details.className = "step-details";
    stepDiv.appendChild(details);

    // Toggle event on header click
    header.onclick = () => {
      if (details.innerHTML.trim() === "") return; // don't toggle if empty
      const isVisible = details.classList.contains("visible");
      if (isVisible) {
        details.classList.remove("visible");
        toggle.classList.remove("open");
      } else {
        details.classList.add("visible");
        toggle.classList.add("open");
        // Scroll inside details to top
        details.scrollTop = 0;
      }
    };

    this.activeAttemptContent.appendChild(stepDiv);

    this.steps[id] = {
      element: stepDiv,
      badge,
      details,
      toggle,
    };
  }

  updateStep(
    id: string,
    status: "pending" | "running" | "success" | "failed",
    detailsHtml?: string,
  ) {
    const step = this.steps[id];
    if (!step) return;

    // Remove old classes from step card
    step.element.classList.remove("running", "success", "failed");
    if (status !== "pending") {
      step.element.classList.add(status);
    }

    // Update badge class and text
    step.badge.className = `step-badge ${status}`;
    step.badge.innerText = status;

    // Update details if provided
    if (detailsHtml !== undefined) {
      step.details.innerHTML = detailsHtml;
      if (detailsHtml.trim() !== "") {
        step.toggle.style.visibility = "visible";
        // Auto-expand on success/failure to show output details, except if it's pending/running
        if (status === "success" || status === "failed") {
          step.details.classList.add("visible");
          step.toggle.classList.add("open");
        }
      } else {
        step.toggle.style.visibility = "hidden";
        step.details.classList.remove("visible");
        step.toggle.classList.remove("open");
      }
    }

    const consoleOutput = document.getElementById("consoleOutput");
    if (consoleOutput) {
      consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }
  }
}

// Module-scoped pipeline instance
let pipeline: PipelineManager;

class BrowserLLMAdapter implements LLMAdapter {
  async prompt(messages: LLMMessage[]): Promise<string> {
    pipeline.updateStep(
      "generation",
      "running",
      `<div style="color: var(--text-muted)">Requesting canvas drawing instructions from Gemini...</div>`,
    );

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    if (!res.ok) {
      const errText = await res.text();
      const err = new Error(`Failed to prompt LLM: ${errText}`);
      pipeline.updateStep(
        "generation",
        "failed",
        `<div class="error-box">Code Generation Failed!\nError: ${err.message}</div>`,
      );
      throw err;
    }

    const data = (await res.json()) as { code: string };
    const escapedCode = data.code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    pipeline.updateStep(
      "generation",
      "success",
      `<div style="display: flex; flex-direction: column; gap: 0.5rem; max-width: 100%; min-width: 0;">
        <div>Gemini generated drawing instructions successfully:</div>
        <pre><code>${escapedCode}</code></pre>
      </div>`,
    );
    return data.code;
  }
}

class CanvasExecutor implements CodeExecutor<string> {
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly originalPrompt: string,
  ) {}

  async execute(code: string): Promise<SandboxResult<string>> {
    pipeline.updateStep(
      "execution",
      "running",
      `<div style="color: var(--text-muted)">Compiling and running code on browser canvas...</div>`,
    );

    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      const error = new Error("Failed to get 2D context");
      pipeline.updateStep(
        "execution",
        "failed",
        `<div class="error-box">Failed to get 2D context from HTML Canvas element.</div>`,
      );
      pipeline.updateStep(
        "vision",
        "failed",
        `<div style="color: var(--text-muted)">Skipped due to sandbox execution failure.</div>`,
      );
      pipeline.updateStep(
        "evaluation",
        "failed",
        `<div style="color: var(--text-muted)">Skipped due to sandbox execution failure.</div>`,
      );
      return { success: false, error };
    }

    // Clear canvas before drawing
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    let cleanedCode = code.trim();
    // Remove import statements
    cleanedCode = cleanedCode.replace(
      /^import\s+[\s\S]*?from\s+['"].*?['"];?/gm,
      "",
    );

    // Extract body of standard function wrapper if present
    const functionMatch = cleanedCode.match(
      /(?:export\s+default\s+)?(?:async\s+)?function\s*\w*\s*\([^)]*\)\s*\{([\s\S]*)\}/,
    );
    if (functionMatch) {
      cleanedCode = functionMatch[1];
    } else {
      // Extract body of arrow function wrapper if present
      const arrowMatch = cleanedCode.match(
        /(?:export\s+default\s+)?(?:\([^)]*\)|[a-zA-Z_$][\w$]*)\s*=>\s*\{([\s\S]*)\}/,
      );
      if (arrowMatch) {
        cleanedCode = arrowMatch[1];
      }
    }
    // Clean any residual exports
    cleanedCode = cleanedCode.replace(/^\s*export\s+default\s+/gm, "");
    cleanedCode = cleanedCode.replace(/^\s*export\s+/gm, "");

    try {
      // Execute generated canvas drawing code
      // We wrap the code to pass 'canvas' and 'ctx'
      const drawFunction = new Function("canvas", "ctx", cleanedCode);
      drawFunction(this.canvas, ctx);

      pipeline.updateStep(
        "execution",
        "success",
        `<div style="color: var(--success)">Drawing instructions executed successfully without syntax or runtime errors.</div>`,
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      pipeline.updateStep(
        "execution",
        "failed",
        `<div class="error-box">Execution Failed!\nSyntax/Runtime Error: ${error.message}</div>`,
      );
      pipeline.updateStep(
        "vision",
        "failed",
        `<div style="color: var(--text-muted)">Skipped due to sandbox execution failure.</div>`,
      );
      pipeline.updateStep(
        "evaluation",
        "failed",
        `<div style="color: var(--text-muted)">Skipped due to sandbox execution failure.</div>`,
      );
      return { success: false, error };
    }

    // Capture visual output
    pipeline.updateStep(
      "vision",
      "running",
      `<div style="color: var(--text-muted)">Capturing canvas snapshot and scanning quality...</div>`,
    );

    const dataUrl = this.canvas.toDataURL("image/png");
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");

    let description = "";
    try {
      const describeRes = await fetch("/api/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64Data }),
      });

      if (!describeRes.ok) {
        const errText = await describeRes.text();
        throw new Error(errText);
      }

      const descData = (await describeRes.json()) as { description: string };
      description = descData.description;

      pipeline.updateStep(
        "vision",
        "success",
        `<div class="thumbnail-container">
          <div style="color: var(--success)">Canvas snapshot successfully analyzed by Gemini Vision:</div>
          <div style="display: flex; align-items: flex-start; gap: 1rem; margin-top: 0.5rem; max-width: 100%; min-width: 0;">
            <img src="${dataUrl}" class="thumbnail-img" />
            <div style="flex-grow: 1; min-width: 0; overflow-wrap: break-word; word-break: break-word;">
              <div style="font-weight: 600; font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Description:</div>
              <div style="margin-top: 0.25rem; font-style: italic; color: #93c5fd; white-space: pre-wrap;">"${description}"</div>
            </div>
          </div>
        </div>`,
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      pipeline.updateStep(
        "vision",
        "failed",
        `<div class="error-box">Vision Validation Failed!\nError: ${error.message}</div>`,
      );
      pipeline.updateStep(
        "evaluation",
        "failed",
        `<div style="color: var(--text-muted)">Skipped due to vision validation failure.</div>`,
      );
      return { success: false, error };
    }

    // Evaluate quality matching
    pipeline.updateStep(
      "evaluation",
      "running",
      `<div style="color: var(--text-muted)">Comparing intent prompt against vision description...</div>`,
    );

    try {
      const compareRes = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalDescription: this.originalPrompt,
          visionDescription: description,
        }),
      });

      if (!compareRes.ok) {
        const errText = await compareRes.text();
        throw new Error(errText);
      }

      const compareResult = (await compareRes.json()) as {
        success: boolean;
        reason: string;
      };

      if (compareResult.success) {
        pipeline.updateStep(
          "evaluation",
          "success",
          `<div style="display: flex; flex-direction: column; gap: 0.5rem; max-width: 100%; min-width: 0;">
            <div style="color: var(--success); font-weight: 600;">✓ Approved! Match verified.</div>
            <div style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.15); border-radius: 4px; padding: 0.75rem; color: var(--text-muted); overflow-wrap: break-word; word-break: break-word;">
              <strong>Reason:</strong> ${compareResult.reason}
            </div>
          </div>`,
        );
        return { success: true, context: description };
      } else {
        pipeline.updateStep(
          "evaluation",
          "failed",
          `<div style="display: flex; flex-direction: column; gap: 0.5rem; max-width: 100%; min-width: 0;">
            <div style="color: var(--error); font-weight: 600;">✗ Rejected! Quality/Intent mismatch.</div>
            <div style="background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.15); border-radius: 4px; padding: 0.75rem; color: var(--text-muted); overflow-wrap: break-word; word-break: break-word;">
              <strong>Reason:</strong> ${compareResult.reason}
            </div>
          </div>`,
        );
        return {
          success: false,
          error: new Error(
            `Image validation failed. Reason: ${compareResult.reason}`,
          ),
          context: description,
        };
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      pipeline.updateStep(
        "evaluation",
        "failed",
        `<div class="error-box">Evaluation Failed!\nError: ${error.message}</div>`,
      );
      return { success: false, error };
    }
  }
}

async function runGenerator() {
  const promptInput = document.getElementById("prompt") as HTMLTextAreaElement;
  const runBtn = document.getElementById("runBtn") as HTMLButtonElement;
  const btnText = document.getElementById("btnText") as HTMLSpanElement;
  const spinner = document.getElementById("spinner") as HTMLSpanElement;
  const codeBlock = document.getElementById("codeBlock") as HTMLElement;
  const codePanel = document.getElementById("codePanel") as HTMLElement;
  const canvas = document.getElementById("rpgCanvas") as HTMLCanvasElement;
  const consoleOutput = document.getElementById("consoleOutput") as HTMLElement;

  if (
    !promptInput ||
    !runBtn ||
    !btnText ||
    !spinner ||
    !canvas ||
    !consoleOutput
  )
    return;

  const prompt = promptInput.value.trim();
  if (!prompt) return;

  // Reset UI
  consoleOutput.innerHTML = "";
  codePanel.classList.remove("visible");
  runBtn.disabled = true;
  spinner.style.display = "block";
  btnText.innerText = "Running Self-Healing Loop...";

  // Initialize pipeline
  pipeline = new PipelineManager();
  pipeline.startAttempt(1);

  const failures: { code: string; error: string }[] = [];

  const llm = new BrowserLLMAdapter();
  const executor = new CanvasExecutor(canvas, prompt);

  const loop = new SelfHealingLoop(llm, executor, {
    maxRetries: 3,
    systemPrompt:
      "You are a JavaScript canvas drawing script generator. Output ONLY raw executable JavaScript code that draws on a canvas element.\n" +
      "The variables 'canvas' (HTMLCanvasElement) and 'ctx' (CanvasRenderingContext2D) are already in scope.\n" +
      "Write ONLY the drawing statements (e.g., ctx.fillStyle = '#ff0000'; ctx.fillRect(0,0,10,10);) to draw on the canvas.\n" +
      "Do NOT wrap the code in a function, and do NOT include any 'import' or 'export' statements.\n" +
      "Do NOT include markdown fences, HTML tags, or explanations.",
    buildHealerPrompt: ({ code, error }) => {
      // Store the current failure for context
      failures.push({ code, error });

      let healerPrompt =
        `The execution of your generated code failed during validation.\n\n` +
        `Current Error: ${error}\n\n`;

      healerPrompt += `### History of Failed Attempts & Lessons Learned:\n`;
      failures.forEach((f, idx) => {
        healerPrompt +=
          `- Attempt #${idx + 1} Code:\n` +
          `\`\`\`javascript\n${f.code}\n\`\`\`\n` +
          `- Attempt #${idx + 1} Error/Feedback: ${f.error}\n` +
          `- Lesson Learned: The above code is incorrect because of the error. You must not repeat this mistake.\n\n`;
      });

      healerPrompt +=
        `Please analyze the history of failures above, do not repeat the same errors, and output a corrected, robust version of the code drawing the pixel art character.\n` +
        `Remember: output ONLY raw executable JavaScript code drawing on 'ctx'.`;

      return healerPrompt;
    },
    onRetry: ({ retryCount, error }) => {
      pipeline.finalizeAttempt("Failed");
      pipeline.startAttempt(retryCount + 1);
    },
  });

  try {
    const result = await loop.run(prompt);

    if (result.success) {
      pipeline.finalizeAttempt("Succeeded");
      codeBlock.innerText = result.finalCode;
      codePanel.classList.add("visible");
    } else {
      pipeline.finalizeAttempt("Failed");
    }
  } catch (err) {
    pipeline.finalizeAttempt("Failed");
  } finally {
    runBtn.disabled = false;
    spinner.style.display = "none";
    btnText.innerText = "Generate RPG Character";
  }
}

// Bind to window
(window as any).runGenerator = runGenerator;
