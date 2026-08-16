import { describe, it, expect, vi, afterEach } from "vitest";
import { makeAnthropicProvider } from "@/server/ai/provider";

const SSE_EVENTS = [
  { type: "message_start", message: { id: "msg_1" } },
  { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Let me " } },
  { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "check the data" } },
  { type: "content_block_stop", index: 0 },
  { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hello" } },
  { type: "content_block_stop", index: 1 },
  { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "toolu_1", name: "list_plans", input: {} } },
  { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"a":' } },
  { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: "1}" } },
  { type: "content_block_stop", index: 2 },
  { type: "message_stop" },
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

describe("Anthropic-compatible provider", () => {
  it("posts to a custom base URL with the model and x-api-key", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(sseBody([]), { status: 200, headers: { "Content-Type": "text/event-stream" } })
    );
    const provider = makeAnthropicProvider("deepseek-key", {
      baseURL: "https://api.deepseek.com/anthropic",
      model: "deepseek-v4-flash",
    });

    const it = provider.stream({ system: "s", messages: [], tools: [], max_tokens: 10 });
    await it.next();

    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/anthropic/v1/messages");
    expect(init.headers["x-api-key"]).toBe("deepseek-key");
    expect(JSON.parse(init.body).model).toBe("deepseek-v4-flash");
    expect(JSON.parse(init.body).stream).toBe(true);
  });

  it("parses Anthropic SSE into thinking, text deltas and tool_use blocks", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(sseBody(SSE_EVENTS), { status: 200 })
    );
    const provider = makeAnthropicProvider("k", { baseURL: "https://api.deepseek.com/anthropic" });

    const events = [];
    for await (const e of provider.stream({ system: "s", messages: [], tools: [], max_tokens: 10 })) {
      events.push(e);
    }

    expect(events).toEqual([
      { type: "thinking", text: "Let me check the data" },
      { type: "text_delta", text: "Hello" },
      { type: "tool_use", name: "list_plans", args: { a: 1 } },
    ]);
  });

  it("throws a readable error on non-200 responses", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("nope", { status: 429, statusText: "Too Many Requests" }));
    const provider = makeAnthropicProvider("k", { baseURL: "https://api.deepseek.com/anthropic" });
    const gen = provider.stream({ system: "s", messages: [], tools: [], max_tokens: 10 });
    await expect(gen.next()).rejects.toThrow(/429/);
  });
});
