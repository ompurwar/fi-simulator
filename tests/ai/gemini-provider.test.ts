import { describe, it, expect, vi, afterEach } from "vitest";
import {
  makeGeminiProvider,
  convertJsonSchemaToGeminiSchema,
  buildGeminiFunctionDeclarations,
  buildGeminiContents,
} from "@/server/ai/geminiProvider";

const GEMINI_SSE_EVENTS = [
  {
    candidates: [
      {
        content: {
          parts: [
            { thought: "Thinking about financial plan..." },
            { text: "Here is your " },
          ],
        },
      },
    ],
  },
  {
    candidates: [
      {
        content: {
          parts: [
            { text: "financial summary." },
            {
              functionCall: {
                name: "list_plans",
                args: { limit: 5 },
              },
            },
          ],
        },
      },
    ],
  },
];

function sseBody(events: any[]): ReadableStream<Uint8Array> {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("convertJsonSchemaToGeminiSchema", () => {
  it("converts JSON Schema types to Gemini OpenAPI types", () => {
    const jsonSchema = {
      type: "object",
      required: ["title", "amount"],
      properties: {
        title: { type: "string", description: "Plan title" },
        amount: { type: "number", description: "Target amount" },
        tags: { type: "array", items: { type: "string" } },
      },
    };

    const result = convertJsonSchemaToGeminiSchema(jsonSchema);
    expect(result.type).toBe("OBJECT");
    expect(result.required).toEqual(["title", "amount"]);
    expect(result.properties.title.type).toBe("STRING");
    expect(result.properties.amount.type).toBe("NUMBER");
    expect(result.properties.tags.type).toBe("ARRAY");
    expect(result.properties.tags.items.type).toBe("STRING");
  });
});

describe("buildGeminiContents", () => {
  it("converts assistant tool_use and user tool_result turns into model functionCall and user functionResponse", () => {
    const messages = [
      {
        role: "user" as const,
        content: [{ type: "text", text: "What are my plans?" }],
      },
      {
        role: "assistant" as const,
        content: [
          { type: "thinking", thinking: "I should call list_plans" },
          { type: "tool_use", id: "call_123", name: "list_plans", input: { limit: 10 } },
        ],
      },
      {
        role: "user" as const,
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_123",
            content: JSON.stringify([{ id: "p1", title: "Retirement" }]),
          },
        ],
      },
    ];

    const contents = buildGeminiContents(messages);

    expect(contents).toHaveLength(3);
    expect(contents[0]).toEqual({
      role: "user",
      parts: [{ text: "What are my plans?" }],
    });
    expect(contents[1]).toEqual({
      role: "model",
      parts: [
        { thought: "I should call list_plans" },
        { functionCall: { name: "list_plans", args: { limit: 10 } } },
      ],
    });
    expect(contents[2]).toEqual({
      role: "user",
      parts: [
        {
          functionResponse: {
            name: "list_plans",
            response: [{ id: "p1", title: "Retirement" }],
          },
        },
      ],
    });
  });
});

describe("Google Gemini Provider", () => {
  it("streams SSE responses into thinking, text deltas and tool_use blocks", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(sseBody(GEMINI_SSE_EVENTS), { status: 200 })
    );

    const provider = makeGeminiProvider("test-gemini-key", {
      model: "gemini-2.5-flash",
    });

    const events = [];
    for await (const e of provider.stream({
      system: "You are a financial advisor.",
      messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
      tools: [
        {
          name: "list_plans",
          description: "List all plans",
          input_schema: { type: "object", properties: { limit: { type: "number" } } },
        },
      ],
      max_tokens: 1000,
    })) {
      events.push(e);
    }

    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toContain("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=test-gemini-key");
    const body = JSON.parse(init.body);
    expect(body.systemInstruction.parts[0].text).toBe("You are a financial advisor.");
    expect(body.tools[0].functionDeclarations[0].name).toBe("list_plans");

    expect(events).toEqual([
      { type: "thinking", text: "Thinking about financial plan..." },
      { type: "text_delta", text: "Here is your " },
      { type: "text_delta", text: "financial summary." },
      { type: "tool_use", name: "list_plans", args: { limit: 5 } },
    ]);
  });

  it("throws a readable error when GEMINI_API_KEY is missing", async () => {
    const provider = makeGeminiProvider("");
    const gen = provider.stream({ system: "s", messages: [], tools: [], max_tokens: 10 });
    await expect(gen.next()).rejects.toThrow(/GEMINI_API_KEY is missing/);
  });

  it("throws a readable error on non-200 responses", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("Quota exceeded", { status: 429, statusText: "Too Many Requests" })
    );
    const provider = makeGeminiProvider("k");
    const gen = provider.stream({ system: "s", messages: [], tools: [], max_tokens: 10 });
    await expect(gen.next()).rejects.toThrow(/429 Too Many Requests/);
  });
});
