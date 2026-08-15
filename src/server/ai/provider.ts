/** Anthropic Messages API provider over plain fetch (no SDK dependency). */

import type { AiProvider } from "./types";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

interface ContentBlockStartEvent {
  type: "content_block_start";
  index: number;
  content_block: { type: "tool_use"; id: string; name: string; input: Record<string, any> };
}

interface ContentBlockDeltaEvent {
  type: "content_block_delta";
  index: number;
  delta: { type: "text_delta"; text: string } | { type: "input_json_delta"; partial_json: string };
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
}

/**
 * Build an AiProvider that talks to the Anthropic Messages API. Pass an empty
 * apiKey for a provider that throws when used (used when the server has no key).
 */
export function makeAnthropicProvider(
  apiKey: string,
  opts: { model?: string } = {}
): AiProvider {
  const model = opts.model ?? "claude-3-5-sonnet-latest";

  return {
    async *stream(params) {
      if (!apiKey) {
        throw new Error("AI not configured: ANTHROPIC_API_KEY is missing");
      }

      const res = await fetch(ANTHROPIC_URL, {
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
                    argsJson: JSON.stringify(ev.content_block.input || {}),
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
                }
                break;
              }
              case "content_block_stop": {
                const ev = event as ContentBlockStopEvent;
                const block = toolBlocks.get(ev.index);
                if (!block) break;
                toolBlocks.delete(ev.index);
                try {
                  yield {
                    type: "tool_use",
                    name: block.name,
                    args: JSON.parse(block.argsJson),
                  };
                } catch {
                  // malformed JSON args — drop the tool use rather than crash the stream
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
