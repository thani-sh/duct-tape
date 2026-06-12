# duct-tape

An LLM-backed self-healing execution loop that sandboxes, debugs, and automatically self-corrects generated code.

## Getting Started

```bash
bun add @thani-sh/duct-tape
```

```typescript
import { runSelfHealingLoop, NodeVMSandbox } from "@thani-sh/duct-tape";
import { OpenAI } from "openai";

const openai = new OpenAI();

// Initialize the isolated sandbox executor
const executor = new NodeVMSandbox({
  checkValue: (x: number) => x * 2,
});

// Run self-healing compilation loop
const { success, finalCode } = await runSelfHealingLoop(
  "Write a function that calls checkValue with 10 and returns the result.",
  {
    llm: {
      prompt: async (messages) => {
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages,
        });
        return response.choices[0].message.content || "";
      },
    },
    executor,
  },
);

console.log("Success:", success);
console.log("Code:\n", finalCode);
```
