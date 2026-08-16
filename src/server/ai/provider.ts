/** Anthropic Messages API provider over plain fetch (no SDK dependency). */

import type { AiProvider } from "./types";

const ANTHROPIC_BASE_URL = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";

interface ContentBlockStartEvent {
  type: "content_block_start";
  index: number;
  content_block:
    | { type: "tool_use"; id: string; name: string; input: Record<string, any> }
    | { type: "thinking"; thinking: string; signature?: string }
    | { type: string; [k: string]: any };
}

interface ContentBlockDeltaEvent {
  type: "content_block_delta";
  index: number;
  delta:
    | { type: "text_delta"; text: string }
    | { type: "input_json_delta"; partial_json: string }
    | { type: "thinking_delta"; thinking: string };
}

interface ContentBlockStopEvent {
  type: "content_block_stop";
  index: number;
}

interface ToolUseBlock {
  index: number;
  id: string;
  name: string;
  argsJson: string;
  /** input sent inline at content_block_start (fallback when no deltas arrive) */
  initialInput?: Record<string, any>;
}

interface ThinkingBlock {
  index: number;
  text: string;
  signature?: string;
}

/**
 * Build an AiProvider that talks to the Anthropic Messages API. Pass an empty
 * apiKey for a provider that throws when used (used when the server has no key).
 *
 * The endpoint is fully compatible with Anthropic-format gateways: point
 * baseURL at any Anthropic-compatible service (e.g. DeepSeek's
 * `https://api.deepseek.com/anthropic`) and set the model name accordingly.
 */
export function makeAnthropicProvider(
  apiKey: string,
  opts: { model?: string; baseURL?: string } = {}
): AiProvider {
  const model = opts.model ?? "claude-3-5-sonnet-latest";
  const baseURL = (opts.baseURL ?? ANTHROPIC_BASE_URL).replace(/\/$/, "");
  const url = `${baseURL}/v1/messages`;

  return {
    async *stream(params) {
      if (!apiKey) {
        throw new Error("AI not configured: ANTHROPIC_API_KEY is missing");
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: params.max_tokens,
          system: params.system,
          messages: params.messages,
          tools: params.tools,
          stream: true,
        }),
        signal: params.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `Anthropic API error ${res.status} ${res.statusText}: ${body.slice(0, 500)}`
        );
      }

      if (!res.body) {
        throw new Error("Anthropic API returned an empty body");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const toolBlocks = new Map<number, ToolUseBlock>();
      const thinkingBlocks = new Map<number, ThinkingBlock>();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line; keep the trailing partial.
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
              continue; // partial/unknown frame — ignore
            }

            switch (event.type) {
              case "content_block_start": {
                const ev = event as ContentBlockStartEvent;
                if (ev.content_block?.type === "tool_use") {
                  toolBlocks.set(ev.index, {
                    index: ev.index,
                    id: ev.content_block.id,
                    name: ev.content_block.name,
                    // start carries an empty `input` placeholder; real args come
                    // via input_json_delta — start from "" so fragments join cleanly
                    argsJson: "",
                    initialInput: ev.content_block.input || undefined,
                  });
                } else if (ev.content_block?.type === "thinking") {
                  thinkingBlocks.set(ev.index, {
                    index: ev.index,
                    text: ev.content_block.thinking || "",
                    signature: ev.content_block.signature,
                  });
                }
                break;
              }
              case "content_block_delta": {
                const ev = event as ContentBlockDeltaEvent;
                if (ev.delta?.type === "text_delta") {
                  yield { type: "text_delta", text: ev.delta.text };
                } else if (ev.delta?.type === "input_json_delta") {
                  const block = toolBlocks.get(ev.index);
                  if (block) block.argsJson += ev.delta.partial_json;
                } else if (ev.delta?.type === "thinking_delta") {
                  const block = thinkingBlocks.get(ev.index);
                  if (block) block.text += ev.delta.thinking;
                }
                break;
              }
              case "content_block_stop": {
                const ev = event as ContentBlockStopEvent;
                const block = toolBlocks.get(ev.index);
                if (block) {
                  toolBlocks.delete(ev.index);
                  try {
                    const args =
                      block.argsJson !== ""
                        ? JSON.parse(block.argsJson)
                        : block.initialInput ?? {};
                    yield {
                      type: "tool_use",
                      name: block.name,
                      args,
                    };
                  } catch {
                    // malformed JSON args — drop the tool use rather than crash the stream
                  }
                  break;
                }
                const thinking = thinkingBlocks.get(ev.index);
                if (thinking) {
                  thinkingBlocks.delete(ev.index);
                  yield {
                    type: "thinking",
                    text: thinking.text,
                    signature: thinking.signature,
                  };
                }
                break;
              }
              default:
                break; // message_start, message_delta, message_stop, ping, …
            }
          }
        }
      }
    },
  };
}
