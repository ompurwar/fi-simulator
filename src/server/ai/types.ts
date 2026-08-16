/** AI assistant module shared types — provider contract and stream events. */

export type AiRole = "user" | "assistant";

export interface AiMessage {
  role: AiRole;
  content: string;
}

/** Anthropic tool shape (JSON Schema, as the Messages API expects). */
export interface AiToolDef {
  name: string;
  description?: string;
  input_schema: Record<string, any>;
}

/** Events streamed to the chat UI over SSE. */
export type AiStreamEvent =
  | { type: "session"; id: string }
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_call"; name: string; args: Record<string, any> }
  | { type: "tool_result"; name: string; ok: boolean; error?: string }
  | { type: "done" }
  | { type: "error"; message: string };

export interface AiProvider {
  /** Stream an Anthropic Messages request; yields raw text deltas and completed tool_use blocks (with full JSON args). */
  stream(params: {
    system: string;
    messages: { role: "user" | "assistant"; content: any[] }[]; // Anthropic content blocks
    tools: AiToolDef[];
    max_tokens: number;
    signal?: AbortSignal;
  }): AsyncGenerator<
    | { type: "text_delta"; text: string }
    | { type: "tool_use"; name: string; args: Record<string, any> }
    | { type: "thinking"; text: string; signature?: string }
  >;
}
