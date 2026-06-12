# duct-tape

An LLM-backed self-healing execution loop that sandboxes, debugs, and automatically self-corrects generated code.

## Getting Started

```bash
bun add @thani-sh/duct-tape
```

```typescript
import { SelfHealingLoop, NodeVMSandbox } from "@thani-sh/duct-tape";
import { OpenAI } from "openai";

const openai = new OpenAI();
const llmConfig = {
  prompt: async (messages) => {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
    });
    return response.choices[0].message.content || "";
  },
};

// Initialize the isolated sandbox executor
const executor = new NodeVMSandbox({
  checkValue: (x: number) => x * 2,
});

// Initialize the self-healing loop
const loop = new SelfHealingLoop(llmcfg, executor);

// Run the self-healing process
const { success, finalCode } = await loop.run(
  "Write a function that calls checkValue with 10 and returns the result.",
);

console.log("Success:", success);
console.log("Code:\n", finalCode);
```
