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
  toolCalls: PendingToolCall[],
  toolResults: { tool_use_id: string; content: string }[],
  pendingAssistantText: string
): { role: "user" | "assistant"; content: any[] }[] {
  const out: { role: "user" | "assistant"; content: any[] }[] = messages.map(
    (m) => ({ role: m.role, content: [{ type: "text", text: m.content }] })
  );

  if (toolCalls.length > 0) {
    const assistantContent: any[] = [];
    if (pendingAssistantText) {
      assistantContent.push({ type: "text", text: pendingAssistantText });
    }
    for (const call of toolCalls) {
      assistantContent.push({ type: "tool_use", id: call.id, name: call.name, input: call.args });
    }
    out.push({ role: "assistant", content: assistantContent });

    out.push({
      role: "user",
      content: toolResults.map((r) => ({
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
  const toolCalls: PendingToolCall[] = [];
  const toolResults: { tool_use_id: string; content: string }[] = [];
  let pendingAssistantText = "";
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    const anthropicMessages = buildAnthropicMessages(
      messages,
      toolCalls,
      toolResults,
      pendingAssistantText
    );

    let currentText = "";
    const collected: PendingToolCall[] = [];
    try {
      for await (const event of provider.stream({
        system: SYSTEM_PROMPT,
        messages: anthropicMessages,
        tools,
        max_tokens: 4096,
        signal,
      })) {
        if (event.type === "text_delta") {
          currentText += event.text;
          emit({ type: "text", text: event.text });
        } else {
          collected.push({
            id: `toolu_${iteration}_${collected.length}`,
            name: event.name,
            args: event.args,
          });
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
      toolCalls.push(call);
      emit({
        type: "tool_result",
        name: call.name,
        ok: result.ok,
        error: result.ok ? undefined : result.error.message,
      });
      toolResults.push({
        tool_use_id: call.id,
        content: result.ok
          ? JSON.stringify({ ok: true, data: result.data })
          : JSON.stringify({ ok: false, error: result.error }),
      });
    }
    pendingAssistantText = currentText;
    iteration++;
  }

  emit({ type: "error", message: "iteration limit" });
  emit({ type: "done" });
}
