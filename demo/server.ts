import { GoogleGenAI } from "@google/genai";
import { type LLMMessage } from "@thani-sh/duct-tape";

// Build client code on startup
const buildOutput = await Bun.build({
  entrypoints: ["./client.ts"],
  outdir: "./public",
  target: "browser",
  minify: false,
});

if (!buildOutput.success) {
  console.error("Bun build failed:");
  console.error(buildOutput.logs);
  process.exit(1);
}
console.log("Client script successfully compiled to /public/client.js");

// Initialize Gemini API client if key is set
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn(
    "\n[WARNING] GEMINI_API_KEY is not defined. The APIs will return a warning message until you export it.\n",
  );
}

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Helper to map message history to Gemini API format
function mapMessagesToGemini(messages: LLMMessage[]) {
  return messages.map((m) => {
    let role = m.role;
    if (role === "assistant") role = "model";
    return {
      role: role === "system" ? "user" : role,
      parts: [
        {
          text:
            typeof m.content === "string"
              ? m.content
              : JSON.stringify(m.content),
        },
      ],
    };
  });
}

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    // Serve index.html at root
    if (url.pathname === "/" && req.method === "GET") {
      const file = Bun.file("./index.html");
      return new Response(file);
    }

    // Serve bundled client script
    if (url.pathname === "/public/client.js" && req.method === "GET") {
      const file = Bun.file("./public/client.js");
      return new Response(file);
    }

    // API Key Check Middleware
    if (url.pathname.startsWith("/api/")) {
      if (!ai) {
        return new Response(
          JSON.stringify({
            error:
              "GEMINI_API_KEY environment variable is missing. Please set it and restart the server.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // API Route: Code Generation (LLM 1)
    if (url.pathname === "/api/generate" && req.method === "POST") {
      try {
        const body = (await req.json()) as { messages?: LLMMessage[] };
        const messages = body.messages || [];

        const systemMessage = messages.find((m) => m.role === "system");
        const systemInstruction = systemMessage
          ? typeof systemMessage.content === "string"
            ? systemMessage.content
            : JSON.stringify(systemMessage.content)
          : undefined;

        const conversationMessages = messages.filter(
          (m) => m.role !== "system",
        );
        const contents = mapMessagesToGemini(conversationMessages);

        const response = await ai!.models.generateContent({
          model: "gemini-3.1-flash-lite",
          contents,
          config: systemInstruction ? { systemInstruction } : undefined,
        });

        // Strip markdown backticks from response text if present
        let code = response.text || "";
        code = code.trim();
        if (code.startsWith("```")) {
          code = code.replace(/^```[a-zA-Z]*\n/, "");
          code = code.replace(/\n```$/, "");
        }

        return new Response(JSON.stringify({ code: code.trim() }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // API Route: Image Description (LLM 2 - Vision)
    if (url.pathname === "/api/describe" && req.method === "POST") {
      try {
        const body = (await req.json()) as { image?: string };
        const imageBase64 = body.image;

        if (!imageBase64) {
          return new Response(JSON.stringify({ error: "Missing image data" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const response = await ai!.models.generateContent({
          model: "gemini-3.1-flash-lite",
          contents: [
            "Describe this RPG game character image in detail. Focus on the character type, colors, accessories, actions, and overall appearance.",
            {
              inlineData: {
                data: imageBase64,
                mimeType: "image/png",
              },
            },
          ],
        });

        return new Response(
          JSON.stringify({ description: response.text || "" }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // API Route: Compare Descriptions (LLM 3 - Evaluator)
    if (url.pathname === "/api/compare" && req.method === "POST") {
      try {
        const body = (await req.json()) as {
          originalDescription?: string;
          visionDescription?: string;
        };
        const original = body.originalDescription;
        const vision = body.visionDescription;

        if (!original || !vision) {
          return new Response(
            JSON.stringify({ error: "Missing original or vision description" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        const prompt =
          `You are a QA validator. Compare the user's original request:\n` +
          `"${original}"\n\n` +
          `against the description of the generated drawing:\n` +
          `"${vision}"\n\n` +
          `Determine if the drawing acceptably matches the request. Be reasonable—it's pixel art, so minor stylistic differences are fine, but the core elements (e.g. if they asked for a wizard casting a blue spell, it should look like a wizard with blue elements) must match.\n` +
          `Output your response strictly as a JSON object with the keys "success" (boolean) and "reason" (string explaining why it is or isn't acceptable). Do not include markdown fences or any other text.`;

        const response = await ai!.models.generateContent({
          model: "gemini-3.1-flash-lite",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          },
        });

        // Parse returned JSON safely
        const result = JSON.parse(response.text || "{}") as {
          success?: boolean;
          reason?: string;
        };

        return new Response(
          JSON.stringify({
            success: result.success ?? false,
            reason: result.reason ?? "Evaluation failed to yield verdict",
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Demo dev server running at: http://localhost:${server.port}`);
