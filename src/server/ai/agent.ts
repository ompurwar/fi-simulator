/** Server-side agent loop: LLM <-> registry tool-call loop, streaming SSE events. */

import { z } from "zod";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import type { ToolDefinition } from "../mcp/types";
import { callRegistryTool } from "../mcp/registry";
import { SYSTEM_PROMPT } from "./prompts";
import type { AiMessage, AiProvider, AiStreamEvent, AiToolDef } from "./types";

export interface AgentLoopInput {
  ctx: { user_id: string };
  messages: AiMessage[];
  registry: ToolDefinition[];
  provider: AiProvider;
  signal?: AbortSignal;
  onEvent?: (e: AiStreamEvent) => void;
}

export const MAX_ITERATIONS = 8;

interface PendingToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
}

/** Build Anthropic messages: conversation, then assistant tool_use + user tool_result blocks. */
function buildAnthropicMessages(
  messages: AiMessage[],
  iterations: { assistant: any[]; results: { tool_use_id: string; content: string }[] }[]
): { role: "user" | "assistant"; content: any[] }[] {
  const out: { role: "user" | "assistant"; content: any[] }[] = messages.map(
    (m) => ({ role: m.role, content: [{ type: "text", text: m.content }] })
  );

  // Echo each tool-using turn in order — assistant blocks (thinking/text/tool_use)
  // MUST be passed back verbatim (required by DeepSeek thinking mode; harmless for Anthropic).
  for (const it of iterations) {
    out.push({ role: "assistant", content: it.assistant });
    out.push({
      role: "user",
      content: it.results.map((r) => ({
        type: "tool_result",
        tool_use_id: r.tool_use_id,
        content: r.content,
      })),
    });
  }

  return out;
}

/** Convert registry ToolDefinitions to Anthropic AiToolDefs; skip any that fail schema conversion. */
function buildAnthropicTools(registry: ToolDefinition[]): AiToolDef[] {
  const tools: AiToolDef[] = [];
  for (const def of registry) {
    try {
      tools.push({
        name: def.name,
        description: def.description,
        input_schema: toJsonSchemaCompat(z.object(def.inputSchema)),
      });
    } catch {
      // skip tools whose zod shape cannot be converted to JSON Schema
    }
  }
  return tools;
}

/**
 * Run the tool-use loop against the LLM provider. Streams AiStreamEvents via
 * onEvent; never rethrows — failures surface as { type: "error" } events.
 */
export async function runAgentLoop(input: AgentLoopInput): Promise<void> {
  const { ctx, messages, registry, provider, signal, onEvent } = input;
  const emit = (e: AiStreamEvent) => onEvent?.(e);

  const tools = buildAnthropicTools(registry);
  const iterations: { assistant: any[]; results: { tool_use_id: string; content: string }[] }[] = [];
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    const anthropicMessages = buildAnthropicMessages(messages, iterations);

    // Rebuild this turn's assistant content blocks in arrival order: thinking
    // segments first (reasoning), then text, then tool_use blocks.
    const assistantBlocks: any[] = [];
    let collected: PendingToolCall[] = [];
    const collectedResults: { tool_use_id: string; content: string }[] = [];
    try {
      for await (const event of provider.stream({
        system: SYSTEM_PROMPT,
        messages: anthropicMessages,
        tools,
        // Generous budget: thinking-mode models (DeepSeek) count reasoning
        // tokens against max_tokens, so 4096 truncated visible replies.
        max_tokens: 16384,
        signal,
      })) {
        if (event.type === "text_delta") {
          const last = assistantBlocks[assistantBlocks.length - 1];
          if (last?.type === "text") {
            last.text += event.text;
          } else {
            assistantBlocks.push({ type: "text", text: event.text });
          }
          emit({ type: "text", text: event.text });
        } else if (event.type === "thinking") {
          assistantBlocks.push({
            type: "thinking",
            thinking: event.text,
            ...(event.signature ? { signature: event.signature } : {}),
          });
        } else {
          const call: PendingToolCall = {
            id: `toolu_${iteration}_${collected.length}`,
            name: event.name,
            args: event.args,
          };
          collected.push(call);
          assistantBlocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.args });
          emit({ type: "tool_call", name: event.name, args: event.args });
        }
      }
    } catch (e: any) {
      emit({ type: "error", message: String(e?.message || e) });
      return;
    }

    if (collected.length === 0) {
      emit({ type: "done" });
      return;
    }

    // execute every requested tool in order, then continue the loop
    for (const call of collected) {
      const result = await callRegistryTool(registry, ctx, call.name, call.args);
      emit({
        type: "tool_result",
        name: call.name,
        ok: result.ok,
        error: result.ok ? undefined : result.error.message,
        // Share-object results carry the created entity id — surfaced as a reference chip.
        ...(result.ok && (call.name === "create_share_object" || call.name === "update_share_object")
          ? { result: result.data }
          : {}),
      });
      collectedResults.push({
        tool_use_id: call.id,
        content: result.ok
          ? JSON.stringify({ ok: true, data: result.data })
          : JSON.stringify({ ok: false, error: result.error }),
      });
    }
    iterations.push({ assistant: assistantBlocks, results: collectedResults });
    collected = [];
    iteration++;
  }

  emit({ type: "error", message: "iteration limit" });
  emit({ type: "done" });
}
