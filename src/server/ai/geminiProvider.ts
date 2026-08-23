/** Google Gemini API provider over plain fetch (no heavy SDK dependency). */

import type { AiProvider, AiToolDef } from "./types";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";

/**
 * Clean and convert a standard JSON Schema into a Gemini-compatible OpenAPI schema.
 */
export function convertJsonSchemaToGeminiSchema(schema: any): Record<string, any> {
  if (!schema || typeof schema !== "object") {
    return { type: "OBJECT", properties: {} };
  }

  const out: Record<string, any> = {};

  // Map type to uppercase if string
  if (typeof schema.type === "string") {
    out.type = schema.type.toUpperCase();
  } else if (Array.isArray(schema.type)) {
    // e.g. ["string", "null"] -> use the primary non-null type
    const primary = schema.type.find((t: string) => t !== "null");
    out.type = primary ? primary.toUpperCase() : "STRING";
  } else {
    out.type = "OBJECT";
  }

  if (schema.description) out.description = schema.description;
  if (Array.isArray(schema.enum)) out.enum = schema.enum;
  if (Array.isArray(schema.required)) out.required = schema.required;

  if (schema.properties && typeof schema.properties === "object") {
    out.properties = {};
    for (const [key, prop] of Object.entries(schema.properties)) {
      out.properties[key] = convertJsonSchemaToGeminiSchema(prop);
    }
  }

  if (schema.items) {
    out.items = convertJsonSchemaToGeminiSchema(schema.items);
  }

  return out;
}

/**
 * Convert Anthropic-style tool definitions to Gemini Function Declarations.
 */
export function buildGeminiFunctionDeclarations(tools: AiToolDef[]): any[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description || "",
    parameters: convertJsonSchemaToGeminiSchema(t.input_schema),
  }));
}

/**
 * Convert Anthropic-style message turns (with tool_use / tool_result blocks)
 * into Google Gemini `contents` turns.
 */
export function buildGeminiContents(
  messages: { role: "user" | "assistant"; content: any[] }[]
): any[] {
  const contents: any[] = [];
  // Keep track of tool_use id -> tool name mapping for functionResponse
  const toolNameById = new Map<string, string>();

  for (const msg of messages) {
    if (msg.role === "assistant") {
      const parts: any[] = [];
      for (const block of msg.content) {
        if (block.type === "text" && block.text) {
          parts.push({ text: block.text });
        } else if (block.type === "thinking" && block.thinking) {
          parts.push({ thought: block.thinking });
        } else if (block.type === "tool_use") {
          if (block.id && block.name) {
            toolNameById.set(block.id, block.name);
          }
          parts.push({
            functionCall: {
              name: block.name,
              args: block.input || {},
            },
          });
        }
      }
      if (parts.length > 0) {
        contents.push({ role: "model", parts });
      }
    } else if (msg.role === "user") {
      const parts: any[] = [];
      for (const block of msg.content) {
        if (block.type === "text" && block.text) {
          parts.push({ text: block.text });
        } else if (block.type === "tool_result") {
          const toolName =
            (block.tool_use_id && toolNameById.get(block.tool_use_id)) ||
            block.name ||
            "tool";
          let parsedResponse: any;
          try {
            parsedResponse =
              typeof block.content === "string"
                ? JSON.parse(block.content)
                : block.content;
          } catch {
            parsedResponse = { response: block.content };
          }
          parts.push({
            functionResponse: {
              name: toolName,
              response:
                typeof parsedResponse === "object" && parsedResponse !== null
                  ? parsedResponse
                  : { result: parsedResponse },
            },
          });
        }
      }
      if (parts.length > 0) {
        contents.push({ role: "user", parts });
      }
    }
  }

  return contents;
}

/**
 * Build an AiProvider that communicates with the Google Gemini REST API.
 * Supports streaming text deltas, thinking blocks, and function calling.
 */
export function makeGeminiProvider(
  apiKey: string,
  opts: { model?: string; baseURL?: string } = {}
): AiProvider {
  const model = opts.model ?? "gemini-2.5-flash";
  const baseURL = (opts.baseURL ?? GEMINI_BASE_URL).replace(/\/$/, "");

  return {
    async *stream(params) {
      if (!apiKey) {
        throw new Error("AI not configured: GEMINI_API_KEY is missing");
      }

      const url = `${baseURL}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

      const functionDeclarations = buildGeminiFunctionDeclarations(params.tools || []);
      const contents = buildGeminiContents(params.messages || []);

      const requestBody: any = {
        contents,
      };

      if (params.system) {
        requestBody.systemInstruction = {
          parts: [{ text: params.system }],
        };
      }

      if (functionDeclarations.length > 0) {
        requestBody.tools = [{ functionDeclarations }];
      }

      if (params.max_tokens) {
        requestBody.generationConfig = {
          maxOutputTokens: params.max_tokens,
          temperature: 0.2,
        };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: params.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `Gemini API error ${res.status} ${res.statusText}: ${body.slice(0, 500)}`
        );
      }

      if (!res.body) {
        throw new Error("Gemini API returned an empty body");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (!payload) continue;

            let event: any;
            try {
              event = JSON.parse(payload);
            } catch {
              continue;
            }

            const candidates = event.candidates || [];
            for (const candidate of candidates) {
              const parts = candidate.content?.parts || [];
              for (const part of parts) {
                if (part.thought || part.thinking) {
                  yield {
                    type: "thinking",
                    text: part.thought || part.thinking,
                  };
                }
                if (part.text) {
                  yield {
                    type: "text_delta",
                    text: part.text,
                  };
                }
                if (part.functionCall) {
                  yield {
                    type: "tool_use",
                    name: part.functionCall.name,
                    args: part.functionCall.args || {},
                  };
                }
              }
            }
          }
        }
      }
    },
  };
}
