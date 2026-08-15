"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRobot, faXmark, faPaperPlane, faStop, faWrench, faCheck } from "@fortawesome/free-solid-svg-icons";
import { useFiPlanStore } from "@/store";
import { api, type AssistantMessage } from "@/lib/api";

type ToolStatus = "running" | "ok" | "error";

interface ChatMessageItem {
  id: number;
  kind: "message";
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface ChatToolItem {
  id: number;
  kind: "tool";
  name: string;
  status: ToolStatus;
  error?: string;
}

type ChatItem = ChatMessageItem | ChatToolItem;

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
}

/** Floating AI assistant — streams /api/assistant/chat SSE into chat bubbles + tool badges. */
export function ChatPanel() {
  const profile = useFiPlanStore((s) => s.profile);
  const loading = useFiPlanStore((s) => s.loading);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [items, setItems] = useState<ChatItem[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");

  const abort_ref = useRef<AbortController | null>(null);
  const id_ref = useRef(0);
  const items_ref = useRef<ChatItem[]>([]);
  const list_ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    items_ref.current = items;
  }, [items]);

  useEffect(() => {
    const el = list_ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, open, streaming]);

  if (loading || !profile) return null;

  function NextId() {
    id_ref.current += 1;
    return id_ref.current;
  }

  function Stop() {
    abort_ref.current?.abort();
  }

  async function SendMessage(text: string) {
    const content = text.trim();
    if (!content || streaming) return;
    setError("");

    const history: AssistantMessage[] = items_ref.current
      .filter((i): i is ChatMessageItem => i.kind === "message")
      .map((i) => ({ role: i.role, content: i.content }));
    history.push({ role: "user", content });

    setInput("");
    setItems((prev) => [...prev, { id: NextId(), kind: "message", role: "user", content }]);

    const controller = new AbortController();
    abort_ref.current = controller;
    setStreaming(true);

    let res: Response;
    try {
      res = await api.ChatAssistant(history);
    } catch (e: any) {
      setStreaming(false);
      abort_ref.current = null;
      setError(e.message || "Failed to reach the assistant.");
      return;
    }

    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        msg = body?.error?.msg || body?.message || msg;
      } catch {
        /* keep default */
      }
      if (res.status === 401) msg = "You are not signed in.";
      if (res.status === 503) msg = "Assistant is unavailable — no AI provider is configured.";
      setStreaming(false);
      abort_ref.current = null;
      setError(msg);
      return;
    }

    if (!res.body) {
      setStreaming(false);
      abort_ref.current = null;
      setError("The assistant returned an empty response.");
      return;
    }

    try {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistant_id: number | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";
        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          let evt: any;
          try {
            evt = JSON.parse(payload);
          } catch {
            continue;
          }
          if (evt.type === "text" && typeof evt.text === "string") {
            if (assistant_id === null) {
              assistant_id = NextId();
              setItems((prev) => [
                ...prev,
                { id: assistant_id as number, kind: "message", role: "assistant", content: evt.text, streaming: true },
              ]);
            } else {
              setItems((prev) =>
                prev.map((i) =>
                  i.kind === "message" && i.id === assistant_id
                    ? { ...i, content: i.content + evt.text }
                    : i
                )
              );
            }
          } else if (evt.type === "tool_call") {
            setItems((prev) => [
              ...prev,
              { id: NextId(), kind: "tool", name: String(evt.name || "tool"), status: "running" },
            ]);
          } else if (evt.type === "tool_result") {
            setItems((prev) => {
              const idx = [...prev].reverse().findIndex(
                (i) => i.kind === "tool" && i.name === evt.name && i.status === "running"
              );
              if (idx === -1) return prev;
              const target = prev.length - 1 - idx;
              return prev.map((i, k) =>
                k === target
                  ? { ...i, status: evt.ok ? "ok" : "error", error: evt.error || undefined }
                  : i
              );
            });
          } else if (evt.type === "error") {
            setError(String(evt.message || "The assistant ran into an error."));
          } else if (evt.type === "done") {
            break;
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setError(e?.message || "The stream was interrupted.");
      }
    } finally {
      setItems((prev) =>
        prev.map((i) =>
          i.kind === "message" && i.role === "assistant" && i.streaming
            ? { ...i, streaming: false }
            : i
        )
      );
      setStreaming(false);
      abort_ref.current = null;
    }
  }

  const tool_badge: Record<ToolStatus, string> = {
    running: "border-accent-500/40 bg-accent-500/10 text-accent-300",
    ok: "border-success-500/40 bg-success-500/10 text-success-300",
    error: "border-danger-500/40 bg-danger-500/10 text-danger-300",
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="Open Fi-Plan Assistant"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 grid h-14 w-14 place-content-center rounded-full border-2 border-primary-400 bg-primary-500 text-primary-50 shadow-lg transition-all duration-200 hover:bg-primary-600 hover:shadow-primary-500/40"
        >
          <FontAwesomeIcon icon={faRobot} className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[28rem] w-[22rem] flex-col overflow-hidden rounded-2xl border border-dark-700 bg-dark-800 text-dark-50 shadow-2xl">
          {/* header */}
          <div className="flex items-center justify-between border-b border-dark-700 bg-dark-700 px-4 py-3">
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faRobot} className="text-primary-400" />
              <div>
                <div className="text-sm font-semibold leading-tight">Fi-Plan Assistant</div>
                <div className="text-[10px] text-dark-300">Powered by your plan data</div>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close assistant"
              className="grid h-7 w-7 place-content-center rounded-md text-dark-300 hover:bg-dark-800 hover:text-dark-50"
              onClick={() => setOpen(false)}
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>

          {/* messages */}
          <div ref={list_ref} className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
            {items.length === 0 && !streaming && (
              <div className="m-auto max-w-[90%] text-center text-xs text-dark-300">
                Ask about your plans — runway, net worth, cashflows, what-if simulations…
              </div>
            )}
            {items.map((item) => {
              if (item.kind === "message") {
                const is_user = item.role === "user";
                return (
                  <div
                    key={item.id}
                    className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed ${
                      is_user
                        ? "self-end rounded-br-sm bg-primary-500 text-primary-50"
                        : "self-start rounded-bl-sm bg-dark-700 text-dark-100"
                    }`}
                  >
                    {item.content}
                  </div>
                );
              }
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-2 self-start rounded-full border px-2.5 py-1 text-xs ${tool_badge[item.status]}`}
                  title={item.error || undefined}
                >
                  {item.status === "running" ? (
                    <Spinner className="h-3 w-3 text-accent-300" />
                  ) : item.status === "ok" ? (
                    <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
                  ) : (
                    <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                  )}
                  <FontAwesomeIcon icon={faWrench} className="h-3 w-3 opacity-70" />
                  {item.name}
                </div>
              );
            })}
            {streaming && (
              <div className="flex items-center gap-2 self-start text-xs text-dark-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-400" />
                thinking…
              </div>
            )}
          </div>

          {/* error banner */}
          {error && (
            <div className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-lg border border-danger-500/40 bg-danger-500/10 px-3 py-2 text-xs text-danger-300">
              <span>{error}</span>
              <button
                type="button"
                aria-label="Dismiss error"
                className="text-danger-300 hover:text-danger-200"
                onClick={() => setError("")}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
          )}

          {/* input row */}
          <div className="flex items-end gap-2 border-t border-dark-700 bg-dark-700/60 px-3 py-3">
            <textarea
              rows={2}
              value={input}
              placeholder="Ask the assistant…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  SendMessage(input);
                }
              }}
              className="max-h-24 min-h-[2.25rem] flex-1 resize-none rounded-lg border border-dark-600 bg-dark-800 px-3 py-2 text-sm text-dark-50 placeholder-dark-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
            />
            {streaming ? (
              <button
                type="button"
                aria-label="Stop generating"
                onClick={Stop}
                className="grid h-9 w-9 shrink-0 place-content-center rounded-lg border-2 border-danger-400 bg-danger-500 text-danger-50 hover:opacity-75"
              >
                <FontAwesomeIcon icon={faStop} className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                aria-label="Send message"
                disabled={!input.trim()}
                onClick={() => SendMessage(input)}
                className="grid h-9 w-9 shrink-0 place-content-center rounded-lg border-2 border-primary-400 bg-primary-500 text-primary-50 hover:opacity-75 disabled:opacity-40"
              >
                <FontAwesomeIcon icon={faPaperPlane} className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
