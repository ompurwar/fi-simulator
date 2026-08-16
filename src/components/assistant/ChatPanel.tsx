"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRobot,
  faXmark,
  faPaperPlane,
  faStop,
  faWrench,
  faCheck,
  faListUl,
  faPlus,
  faTrash,
  faFolderOpen,
  faLandmark,
  faShareNodes,
} from "@fortawesome/free-solid-svg-icons";
import { useRouter } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { api, type ChatSessionSummary } from "@/lib/api";

type ToolStatus = "running" | "ok" | "error";

type RefType = "plan" | "networth" | "share";

interface ReferenceChip {
  type: RefType;
  label: string;
  href: string;
}

const ref_icon: Record<RefType, typeof faRobot> = {
  plan: faFolderOpen,
  networth: faLandmark,
  share: faShareNodes,
};

/** Chips derived from a tool_call (args) or tool_result (result) — deduped per message by href. */
function DeriveChips(tool_name: string, args: any, result: any): ReferenceChip[] {
  const chips: ReferenceChip[] = [];
  const args_obj = args && typeof args === "object" ? args : {};
  const plan_id = args_obj.plan_id;
  if (typeof plan_id === "string" && plan_id) {
    chips.push({ type: "plan", label: "Plan", href: `/plan?p_id=${encodeURIComponent(plan_id)}` });
  }
  if (tool_name.startsWith("networth_")) {
    chips.push({ type: "networth", label: "Net worth", href: "/networth" });
  }
  if (tool_name === "create_share_object" || tool_name === "update_share_object") {
    const r = result && typeof result === "object" ? result : {};
    const has_share = Boolean(
      r._id || r.share_id || r.share_object?._id || (Array.isArray(r.share_ids) && r.share_ids.length > 0)
    );
    if (has_share) chips.push({ type: "share", label: "Share", href: "/shared_templates" });
  }
  return chips;
}

function MergeChips(existing: ReferenceChip[] | undefined, incoming: ReferenceChip[]): ReferenceChip[] {
  const seen = new Set((existing ?? []).map((c) => c.href));
  return [...(existing ?? []), ...incoming.filter((c) => !seen.has(c.href))];
}

/** "5m ago" style relative time for unix-ms timestamps (ChatSession uses Date.now()). */
function RelativeTime(ts: number): string {
  const diff_ms = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff_ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(ts).toLocaleDateString();
}

interface ChatMessageItem {
  id: number;
  kind: "message";
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  references?: ReferenceChip[];
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

const md_components: Record<string, any> = {
  p: ({ children }: any) => <p className="my-1 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }: any) => <strong className="font-semibold text-dark-50">{children}</strong>,
  em: ({ children }: any) => <em className="italic">{children}</em>,
  ul: ({ children }: any) => <ul className="my-1 list-disc pl-4">{children}</ul>,
  ol: ({ children }: any) => <ol className="my-1 list-decimal pl-4">{children}</ol>,
  li: ({ children }: any) => <li className="my-0.5 leading-relaxed">{children}</li>,
  h1: ({ children }: any) => <h1 className="my-2 text-base font-semibold text-dark-50">{children}</h1>,
  h2: ({ children }: any) => <h2 className="my-2 text-base font-semibold text-dark-50">{children}</h2>,
  h3: ({ children }: any) => <h3 className="my-2 text-sm font-semibold text-dark-50">{children}</h3>,
  h4: ({ children }: any) => <h4 className="my-2 text-sm font-semibold text-dark-50">{children}</h4>,
  hr: () => <hr className="my-2 border-dark-600" />,
  blockquote: ({ children }: any) => (
    <blockquote className="my-1 border-l-2 border-primary-400 pl-2 italic text-dark-300">{children}</blockquote>
  ),
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary-400 underline hover:text-primary-300">
      {children}
    </a>
  ),
  code: ({ className, children }: any) =>
    className?.includes("language-") ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-dark-800 px-1 py-0.5 text-[0.85em] text-accent-300">{children}</code>
    ),
  pre: ({ children }: any) => (
    <pre className="my-2 overflow-x-auto rounded-lg border border-dark-600 bg-dark-800 p-2.5 text-xs leading-relaxed text-dark-100">
      {children}
    </pre>
  ),
  table: ({ children }: any) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => <thead className="bg-dark-800">{children}</thead>,
  th: ({ children }: any) => (
    <th className="border border-dark-600 px-2 py-1 text-left font-semibold text-dark-50">{children}</th>
  ),
  td: ({ children }: any) => <td className="border border-dark-600 px-2 py-1 text-dark-100">{children}</td>,
  tr: ({ children }: any) => <tr>{children}</tr>,
};

/** Render assistant markdown (GFM: tables, lists, code). Plain text passes through. */
function MarkdownText({ text }: { text: string }) {
  return (
    <div className="break-words text-[0.85rem] leading-relaxed [&_pre]:whitespace-pre-wrap [&_pre_code]:whitespace-pre">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={md_components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

/** Module-level open trigger — registered by the panel, called by external launchers. */let openAssistant: (() => void) | null = null;

/** Open the assistant from anywhere (e.g. the mobile TopNav button). */
export function OpenAssistant() {
  openAssistant?.();
}

/** Floating AI assistant — streams /api/assistant/chat SSE into chat bubbles + tool badges + session drawer. */
export function ChatPanel() {
  const profile = useFiPlanStore((s) => s.profile);
  const loading = useFiPlanStore((s) => s.loading);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [items, setItems] = useState<ChatItem[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");

  const [session_id, setSessionId] = useState<string | null>(null);
  const [sessions_open, setSessionsOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [sessions_loading, setSessionsLoading] = useState(false);
  const [session_deleting, setSessionDeleting] = useState(false);

  const abort_ref = useRef<AbortController | null>(null);
  const id_ref = useRef(0);
  const items_ref = useRef<ChatItem[]>([]);
  const list_ref = useRef<HTMLDivElement | null>(null);
  const pending_refs_ref = useRef<ReferenceChip[]>([]);

  useEffect(() => {
    // expose an imperative open trigger for launchers outside this component
    // (e.g. the mobile TopNav button) — one registered panel at a time.
    openAssistant = () => setOpen(true);
    return () => {
      openAssistant = null;
    };
  }, []);

  useEffect(() => {
    items_ref.current = items;
  }, [items]);

  useEffect(() => {
    const el = list_ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, open, streaming, sessions_open]);

  if (loading || !profile) return null;

  function NextId() {
    id_ref.current += 1;
    return id_ref.current;
  }

  function Stop() {
    abort_ref.current?.abort();
  }

  function NewSession() {
    if (streaming) return;
    abort_ref.current?.abort();
    setItems([]);
    setSessionId(null);
    setError("");
    setSessionsOpen(false);
  }

  function FlushRefs(assistant_id: number | null) {
    const chips = pending_refs_ref.current;
    pending_refs_ref.current = [];
    if (chips.length === 0 || assistant_id === null) return;
    setItems((prev) =>
      prev.map((i) =>
        i.kind === "message" && i.id === assistant_id
          ? { ...i, references: MergeChips(i.references, chips) }
          : i
      )
    );
  }

  async function SendMessage(text: string) {
    const content = text.trim();
    if (!content || streaming) return;
    setError("");

    // The server prepends stored history for session_id — the client sends only the new user message.
    const history = [{ role: "user" as const, content }];

    setInput("");
    setItems((prev) => [...prev, { id: NextId(), kind: "message", role: "user", content }]);
    pending_refs_ref.current = [];

    const controller = new AbortController();
    abort_ref.current = controller;
    setStreaming(true);

    let res: Response;
    try {
      res = await api.ChatAssistant(history, session_id ?? undefined);
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

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistant_id: number | null = null;

    try {
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
          if (evt.type === "session" && evt.id) {
            setSessionId(String(evt.id));
          } else if (evt.type === "text" && typeof evt.text === "string") {
            if (assistant_id === null) {
              assistant_id = NextId();
              const refs = pending_refs_ref.current;
              pending_refs_ref.current = [];
              setItems((prev) => [
                ...prev,
                {
                  id: assistant_id as number,
                  kind: "message",
                  role: "assistant",
                  content: evt.text,
                  streaming: true,
                  references: refs.length > 0 ? refs : undefined,
                },
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
            const name = String(evt.name || "tool");
            setItems((prev) => [
              ...prev,
              { id: NextId(), kind: "tool", name, status: "running" },
            ]);
            pending_refs_ref.current = MergeChips(pending_refs_ref.current, DeriveChips(name, evt.args ?? evt.input, null));
          } else if (evt.type === "tool_result") {
            const name = String(evt.name || "tool");
            setItems((prev) => {
              const idx = [...prev].reverse().findIndex(
                (i) => i.kind === "tool" && i.name === name && i.status === "running"
              );
              if (idx === -1) return prev;
              const target = prev.length - 1 - idx;
              return prev.map((i, k) =>
                k === target
                  ? { ...i, status: evt.ok ? "ok" : "error", error: evt.error || undefined }
                  : i
              );
            });
            pending_refs_ref.current = MergeChips(
              pending_refs_ref.current,
              DeriveChips(name, null, evt.result ?? evt.data ?? evt.output)
            );
          } else if (evt.type === "error") {
            setError(String(evt.message || "The assistant ran into an error."));
          } else if (evt.type === "done") {
            FlushRefs(assistant_id);
            break;
          }
        }
      }
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          setError(e?.message || "The stream was interrupted.");
        }
      } finally {
        FlushRefs(assistant_id);
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

  async function OpenSessions() {
    setSessionsOpen(true);
    setSessionsLoading(true);
    try {
      const list = await api.ListChatSessions();
      setSessions(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e.message || "Failed to load sessions.");
    } finally {
      setSessionsLoading(false);
    }
  }

  async function LoadSession(s: ChatSessionSummary) {
    if (streaming) return;
    try {
      const { session } = await api.GetChatSession(s._id);
      const restored: ChatItem[] = (session.messages ?? [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ id: NextId(), kind: "message", role: m.role, content: m.content }));
      setItems(restored);
      setSessionId(session._id);
      setError("");
      setSessionsOpen(false);
    } catch (e: any) {
      setError(e.message || "Failed to load the session.");
    }
  }

  async function DeleteSession(s: ChatSessionSummary) {
    if (session_deleting) return;
    if (!window.confirm(`Delete session "${s.title || "Untitled session"}"?`)) return;
    setSessionDeleting(true);
    try {
      await api.DeleteChatSession(s._id);
      setSessions((prev) => prev.filter((x) => x._id !== s._id));
      if (session_id === s._id) {
        abort_ref.current?.abort();
        setSessionId(null);
        setItems([]);
      }
    } catch (e: any) {
      setError(e.message || "Failed to delete the session.");
    } finally {
      setSessionDeleting(false);
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
          className="fixed bottom-6 right-6 z-50 hidden md:grid h-14 w-14 place-content-center rounded-full border-2 border-primary-400 bg-primary-500 text-primary-50 shadow-lg transition-all duration-200 hover:bg-primary-600 hover:shadow-primary-500/40"
        >
          <FontAwesomeIcon icon={faRobot} className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-dark-800 text-dark-50 md:inset-auto md:bottom-6 md:right-6 md:h-[28rem] md:w-[22rem] md:rounded-2xl md:border md:border-dark-700 md:shadow-2xl">
          {/* header */}
          <div className="flex items-center justify-between gap-2 border-b border-dark-700 bg-dark-700 px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <FontAwesomeIcon icon={faRobot} className="text-primary-400" />
              <div>
                <div className="truncate text-sm font-semibold leading-tight">Fi-Plan Assistant</div>
                <div className="text-[10px] text-dark-300">Powered by your plan data</div>
              </div>
            </div>
            <button
              type="button"
              aria-label="Past sessions"
              onClick={OpenSessions}
              className="grid h-7 w-7 shrink-0 place-content-center rounded-md text-dark-300 hover:bg-dark-800 hover:text-dark-50"
            >
              <FontAwesomeIcon icon={faListUl} className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Close assistant"
              className="grid h-7 w-7 shrink-0 place-content-center rounded-md text-dark-300 hover:bg-dark-800 hover:text-dark-50"
              onClick={() => setOpen(false)}
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>

          <div className="relative flex min-h-0 flex-1">
            {/* session drawer */}
            {sessions_open && (
              <div className="absolute inset-y-0 left-0 z-10 flex w-56 flex-col border-r border-dark-700 bg-dark-900">
                <div className="flex items-center justify-between border-b border-dark-700 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon icon={faListUl} className="text-primary-400" />
                    <span className="text-sm font-semibold">Sessions</span>
                  </div>
                  <button
                    type="button"
                    aria-label="Close sessions"
                    className="grid h-6 w-6 place-content-center rounded-md text-dark-400 hover:bg-dark-800 hover:text-dark-50"
                    onClick={() => setSessionsOpen(false)}
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </div>
                <button
                  type="button"
                  disabled={streaming}
                  onClick={NewSession}
                  className="mx-3 mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-primary-400/60 bg-primary-500/10 px-3 py-1.5 text-xs font-medium text-primary-300 hover:bg-primary-500/20 disabled:opacity-40"
                >
                  <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                  New session
                </button>
                <div className="mt-2 flex-1 overflow-y-auto px-2 pb-2">
                  {sessions_loading && (
                    <div className="flex items-center justify-center gap-2 py-6 text-xs text-dark-300">
                      <Spinner className="h-3 w-3 text-accent-300" />
                      Loading sessions…
                    </div>
                  )}
                  {!sessions_loading && sessions.length === 0 && (
                    <div className="py-8 text-center text-xs text-dark-300">No past sessions yet.</div>
                  )}
                  {sessions.map((s) => (
                    <div
                      key={s._id}
                      onClick={() => LoadSession(s)}
                      className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 ${
                        s._id === session_id ? "bg-dark-700" : "hover:bg-dark-700/60"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-dark-100">
                          {s.title || "Untitled session"}
                        </div>
                        <div className="text-[10px] text-dark-400">
                          {RelativeTime(s.updated_at)}
                          {s.message_count > 0 ? ` · ${s.message_count} msg${s.message_count === 1 ? "" : "s"}` : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label={`Delete session ${s.title || s._id}`}
                        disabled={session_deleting}
                        onClick={(e) => {
                          e.stopPropagation();
                          DeleteSession(s);
                        }}
                        className="grid h-6 w-6 shrink-0 place-content-center rounded-md text-dark-400 opacity-0 hover:bg-danger-500/10 hover:text-danger-300 group-hover:opacity-100 disabled:opacity-40"
                      >
                        <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* messages */}
            <div ref={list_ref} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
              {items.length === 0 && !streaming && (
                <div className="m-auto flex w-full max-w-[24rem] flex-col gap-3 text-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="grid h-12 w-12 place-content-center rounded-full bg-primary-500/15 text-primary-400">
                      <FontAwesomeIcon icon={faRobot} className="h-6 w-6" />
                    </div>
                    <div className="text-sm font-semibold text-dark-50">Hi, I&apos;m your Fi-Plan assistant</div>
                    <div className="text-xs leading-relaxed text-dark-300">
                      I can read and update your financial plans, run what-if simulations, and answer
                      questions — try one of these:
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {[
                      "What's my current runway?",
                      "Add a ₹30,000 side income from month 12",
                      "Add a 10% hike to my salary from month 24",
                      "Apply 6% inflation to my rent from month 6",
                      "What if my salary doubles in month 24?",
                    ].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => SendMessage(s)}
                        className="rounded-lg border border-dark-600 bg-dark-800 px-3 py-2 text-left text-xs text-dark-100 transition-colors hover:border-primary-400 hover:bg-dark-700 hover:text-dark-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px] leading-relaxed text-dark-400">
                    Entities I touch appear as clickable chips below my replies (plan, net worth, share
                    objects). Conversations auto-save — open the list icon to resume an older session.
                  </div>
                </div>
              )}
              {items.map((item) => {
                if (item.kind === "message") {
                  const is_user = item.role === "user";
                  const is_streaming_item =
                    streaming && !is_user && item.id === items[items.length - 1]?.id;
                  return (
                    <div
                      key={item.id}
                      className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                        is_user
                          ? "self-end rounded-br-sm bg-primary-500 text-primary-50"
                          : "self-start rounded-bl-sm bg-dark-700 text-dark-100"
                      }`}
                    >
                      {is_user ? (
                        <div className="whitespace-pre-wrap">{item.content}</div>
                      ) : is_streaming_item ? (
                        <div className="whitespace-pre-wrap">{item.content}</div>
                      ) : (
                        <MarkdownText text={item.content} />
                      )}
                      {!is_user && item.references && item.references.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.references.map((ref) => (
                            <button
                              key={ref.href}
                              type="button"
                              onClick={() => router.push(ref.href)}
                              className="flex items-center gap-1.5 rounded-full border border-dark-600 bg-dark-800 px-2.5 py-1 text-[11px] text-dark-200 hover:border-primary-400 hover:text-primary-300"
                            >
                              <FontAwesomeIcon icon={ref_icon[ref.type]} className="h-2.5 w-2.5" />
                              {ref.label}
                            </button>
                          ))}
                        </div>
                      )}
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
              placeholder="Ask about your plan — e.g. “what’s my runway?”"
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
