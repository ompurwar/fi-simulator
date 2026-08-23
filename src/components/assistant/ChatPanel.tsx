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
  faBrain,
  faChevronDown,
  faCopy,
  faRotateRight,
  faExpand,
  faCompress,
  faFolderOpen,
  faLandmark,
  faShareNodes,
  faBolt,
  faArrowTrendUp,
  faPiggyBank,
  faCalculator,
  faChevronRight,
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
  p: ({ children }: any) => <p className="my-1.5 first:mt-0 last:mb-0 leading-relaxed text-dark-800">{children}</p>,
  strong: ({ children }: any) => <strong className="font-bold text-dark-900">{children}</strong>,
  em: ({ children }: any) => <em className="italic text-dark-700">{children}</em>,
  ul: ({ children }: any) => <ul className="my-2 list-disc pl-4 space-y-1 text-dark-800">{children}</ul>,
  ol: ({ children }: any) => <ol className="my-2 list-decimal pl-4 space-y-1 text-dark-800">{children}</ol>,
  li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }: any) => <h1 className="my-2 text-base font-bold text-dark-900 border-b border-dark-100 pb-1">{children}</h1>,
  h2: ({ children }: any) => <h2 className="my-2 text-sm font-bold text-dark-900 border-b border-dark-100 pb-1">{children}</h2>,
  h3: ({ children }: any) => <h3 className="my-1.5 text-xs font-bold uppercase tracking-wider text-primary-700">{children}</h3>,
  h4: ({ children }: any) => <h4 className="my-1 text-xs font-bold text-dark-900">{children}</h4>,
  hr: () => <hr className="my-2.5 border-dark-200" />,
  blockquote: ({ children }: any) => (
    <blockquote className="my-2 border-l-4 border-primary-500 bg-primary-50/60 py-1.5 px-3 rounded-r-lg text-xs italic text-dark-700 leading-relaxed">
      {children}
    </blockquote>
  ),
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary-600 font-semibold underline hover:text-primary-700">
      {children}
    </a>
  ),
  code: ({ className, children }: any) =>
    className?.includes("language-") ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded-md bg-dark-100 px-1.5 py-0.5 font-mono text-[0.85em] font-semibold text-primary-700 border border-dark-200/60">
        {children}
      </code>
    ),
  pre: ({ children }: any) => (
    <pre className="my-2 overflow-x-auto rounded-xl border border-dark-700 bg-dark-900 p-3 font-mono text-xs leading-relaxed text-emerald-400 shadow-2xs">
      {children}
    </pre>
  ),
  table: ({ children }: any) => (
    <div className="my-2.5 overflow-x-auto rounded-xl border border-dark-200 shadow-2xs">
      <table className="w-full border-collapse text-xs bg-white">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => <thead className="bg-dark-50 text-dark-800 font-bold border-b border-dark-200">{children}</thead>,
  th: ({ children }: any) => (
    <th className="px-3 py-2 text-left font-bold text-dark-800">{children}</th>
  ),
  td: ({ children }: any) => <td className="border-t border-dark-100 px-3 py-2 text-dark-700">{children}</td>,
  tr: ({ children }: any) => <tr className="hover:bg-dark-50/50 transition-colors">{children}</tr>,
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

/** Copy-to-clipboard button with transient "Copied" feedback. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — ignore
    }
  }

  return (
    <button
      type="button"
      aria-label="Copy message"
      onClick={copy}
      className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
        copied
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
          : "text-dark-400 hover:bg-dark-100 hover:text-dark-700"
      }`}
    >
      <FontAwesomeIcon icon={copied ? faCheck : faCopy} className="h-2.5 w-2.5" />
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
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
  const refresh_plan_list = useFiPlanStore((s) => s.refresh_plan_list);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [items, setItems] = useState<ChatItem[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");

  const [session_id, setSessionId] = useState<string | null>(null);
  const [sessions_open, setSessionsOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [sessions_loading, setSessionsLoading] = useState(false);
  const [session_deleting, setSessionDeleting] = useState(false);

  // Claude Code-style reasoning indicator: captured thinking text, whether the
  // answer has started (auto-collapses the reasoning), and expand/collapse state.
  const [thinking_text, setThinkingText] = useState("");
  const [answer_started, setAnswerStarted] = useState(false);
  const [thinking_collapsed, setThinkingCollapsed] = useState(true);

  const abort_ref = useRef<AbortController | null>(null);
  const id_ref = useRef(0);
  const items_ref = useRef<ChatItem[]>([]);
  const list_ref = useRef<HTMLDivElement | null>(null);
  const pending_refs_ref = useRef<ReferenceChip[]>([]);
  const last_user_ref = useRef<string>("");
  const mutation_flag = useRef(false);

  useEffect(() => {
    // expose an imperative open trigger for launchers outside this component
    // (e.g. the mobile TopNav button) — one registered panel at a time.
    openAssistant = () => setOpen(true);
    return () => {
      openAssistant = null;
    };
  }, []);

  useEffect(() => {
    // Logged out → close the window and reset to a fresh conversation, so the
    // next login opens a brand-new chat (sessions are only created on send).
    if (!profile) {
      abort_ref.current?.abort();
      setOpen(false);
      setItems([]);
      setSessionId(null);
      setError("");
      setSessionsOpen(false);
      setSessions([]);
      setThinkingText("");
      setAnswerStarted(false);
      setThinkingCollapsed(true);
      last_user_ref.current = "";
    }
  }, [profile]);

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
    setThinkingText("");
    setAnswerStarted(false);
    setThinkingCollapsed(true);
    last_user_ref.current = "";
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

  /** Retry the last failed turn IN PLACE: drop the partial/failed bubbles, keep
   *  the user's question, and re-run the loop without re-sending the prompt
   *  (the server re-runs over stored history — no duplicated tokens/messages). */
  async function RetryLast() {
    if (streaming) return;
    const content = last_user_ref.current;
    if (!content) return;

    // No session (e.g. the guardrail path) → plain re-send of the message.
    if (!session_id) {
      await SendMessage(content);
      return;
    }

    abort_ref.current?.abort();
    setError("");
    setThinkingText("");
    setAnswerStarted(false);
    setThinkingCollapsed(true);
    pending_refs_ref.current = [];

    // Remove everything after the last user bubble (failed partial + tool badges).
    setItems((prev) => {
      const lastUserIdx = [...prev].reverse().findIndex((i) => i.kind === "message" && i.role === "user");
      if (lastUserIdx === -1) return prev;
      return prev.slice(0, prev.length - lastUserIdx);
    });

    const controller = new AbortController();
    abort_ref.current = controller;
    setStreaming(true);

    let res: Response;
    try {
      res = await api.ChatAssistantRetry(session_id, controller.signal);
    } catch (e: any) {
      setStreaming(false);
      abort_ref.current = null;
      setError(e?.message || "The stream was interrupted.");
      return;
    }
    await ReadStream(res, null);
  }

  async function SendMessage(text: string) {
    const content = text.trim();
    if (!content || streaming) return;
    setError("");
    setThinkingText("");
    setAnswerStarted(false);
    setThinkingCollapsed(true);

    // The server prepends stored history for session_id — the client sends only the new user message.
    const history = [{ role: "user" as const, content }];

    setInput("");
    last_user_ref.current = content;
    setItems((prev) => [...prev, { id: NextId(), kind: "message", role: "user", content }]);
    pending_refs_ref.current = [];

    const controller = new AbortController();
    abort_ref.current = controller;
    setStreaming(true);

    let res: Response;
    try {
      res = await api.ChatAssistant(history, session_id ?? undefined, controller.signal);
    } catch (e: any) {
      setStreaming(false);
      abort_ref.current = null;
      setError(e?.message || "Failed to reach the assistant.");
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

    await ReadStream(res, null);
  }

  /** Consume the SSE stream into chat items (shared by send + retry). */
  async function ReadStream(res: Response, _assistant_id: number | null) {
    if (!res.body) return;
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
          } else if (evt.type === "thinking" && typeof evt.text === "string") {
            setThinkingText((t) => t + evt.text);
            setThinkingCollapsed(false);
          } else if (evt.type === "text" && typeof evt.text === "string") {
            setAnswerStarted(true);
            setThinkingCollapsed(true); // answer begins → fold the reasoning
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
          } else if (evt.type === "mutation") {
            // The assistant changed persisted data — the app's store is stale.
            mutation_flag.current = true;
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
        // Refresh the app's plan store once when this turn mutated anything
        // (debounced naturally: flag is cleared after the fetch starts).
        if (mutation_flag.current) {
          mutation_flag.current = false;
          refresh_plan_list().catch(() => {});
        }
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
    running: "border-amber-300 bg-amber-50 text-amber-700",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
    error: "border-rose-200 bg-rose-50 text-rose-700",
  };

  const starter_prompts = [
    { text: "What's my current runway & net worth projection?", icon: faBolt },
    { text: "Simulate a 15% salary hike starting from month 24", icon: faArrowTrendUp },
    { text: "Check whether Old or New Tax Regime saves more tax", icon: faCalculator },
    { text: "What if I allocate 40% surplus to investments?", icon: faPiggyBank },
  ];

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="Open Fi-Plan Assistant"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 hidden md:flex h-13 w-13 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all border-2 border-white group"
        >
          <FontAwesomeIcon icon={faRobot} className="h-6 w-6 group-hover:rotate-6 transition-transform" />
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white"></span>
          </span>
        </button>
      )}

      {open && (
        <div
          className={`fixed inset-0 z-50 flex flex-col overflow-hidden bg-white dark:bg-slate-900 text-dark-800 dark:text-slate-100 shadow-2xl transition-all duration-200 md:bottom-6 md:right-6 md:rounded-2xl md:border md:border-dark-200 dark:md:border-slate-800 ${
            expanded
              ? "md:inset-6 md:h-auto md:w-auto"
              : "md:inset-auto md:h-[34rem] md:w-[26rem]"
          }`}
        >
          {/* Lucid Header */}
          <div className="flex items-center justify-between gap-2 border-b border-dark-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3.5">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 border border-primary-200/60 dark:border-primary-800/40">
                <FontAwesomeIcon icon={faRobot} className="text-sm" />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-dark-900 dark:text-white leading-tight">Fi-Plan Assistant</div>
                <div className="text-[10px] font-medium text-dark-400 dark:text-slate-400 truncate">Context-aware financial advisor</div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="New session"
                title="New Chat"
                disabled={streaming}
                onClick={NewSession}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-dark-400 hover:bg-dark-50 dark:hover:bg-slate-800 hover:text-primary-600 dark:hover:text-primary-400 transition-colors disabled:opacity-40"
              >
                <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
              </button>

              <button
                type="button"
                aria-label="Past sessions"
                title={sessions_open ? "Hide History" : "Chat History"}
                onClick={OpenSessions}
                className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                  sessions_open
                    ? "bg-primary-50 dark:bg-primary-950 text-primary-600 dark:text-primary-400 font-bold"
                    : "text-dark-400 hover:bg-dark-50 dark:hover:bg-slate-800 hover:text-dark-800 dark:hover:text-slate-100"
                }`}
              >
                <FontAwesomeIcon icon={faListUl} className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                aria-label="Expand or collapse assistant"
                title={expanded ? "Collapse" : "Expand"}
                onClick={() => setExpanded((e) => !e)}
                className="hidden md:flex h-7 w-7 items-center justify-center rounded-lg text-dark-400 hover:bg-dark-50 dark:hover:bg-slate-800 hover:text-dark-800 dark:hover:text-slate-100 transition-colors"
              >
                <FontAwesomeIcon icon={expanded ? faCompress : faExpand} className="h-3 w-3" />
              </button>

              <button
                type="button"
                aria-label="Close assistant"
                title="Close"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-dark-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-600 transition-colors"
                onClick={() => setOpen(false)}
              >
                <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 bg-dark-50/30 dark:bg-slate-950/40">
            {/* Backdrop for mobile/compact mode */}
            {sessions_open && !expanded && (
              <div
                className="absolute inset-0 z-10 bg-dark-900/30 backdrop-blur-2xs transition-opacity"
                onClick={() => setSessionsOpen(false)}
              />
            )}

            {/* Lucid Session Drawer / Sidebar */}
            {sessions_open && (
              <div
                className={`flex flex-col border-r border-dark-100 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all duration-200 ${
                  expanded
                    ? "relative z-10 w-72 shrink-0 shadow-none"
                    : "absolute inset-y-0 left-0 z-20 w-64 shadow-xl"
                }`}
              >
                <div className="flex items-center justify-between border-b border-dark-100 dark:border-slate-800 px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon icon={faListUl} className="text-primary-600 dark:text-primary-400 text-xs" />
                    <span className="text-xs font-bold text-dark-800 dark:text-slate-200">Saved Conversations</span>
                  </div>
                  <button
                    type="button"
                    aria-label="Close sessions"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-dark-400 hover:bg-dark-100 dark:hover:bg-slate-800 hover:text-dark-800 dark:hover:text-slate-100 transition-colors"
                    onClick={() => setSessionsOpen(false)}
                  >
                    <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                  </button>
                </div>

                <div className="p-3">
                  <button
                    type="button"
                    disabled={streaming}
                    onClick={NewSession}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-primary-700 active:scale-98 transition-all disabled:opacity-40"
                  >
                    <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                    <span>New Conversation</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-2 pb-2">
                  {sessions_loading && (
                    <div className="flex items-center justify-center gap-2 py-8 text-xs text-dark-400">
                      <Spinner className="h-3.5 w-3.5 text-primary-500" />
                      Loading history…
                    </div>
                  )}
                  {!sessions_loading && sessions.length === 0 && (
                    <div className="py-10 text-center text-xs text-dark-400">No saved sessions yet.</div>
                  )}
                  {sessions.map((s) => (
                    <div
                      key={s._id}
                      onClick={() => LoadSession(s)}
                      className={`group mb-1 flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2.5 transition-all ${
                        s._id === session_id
                          ? "bg-primary-50 dark:bg-primary-950/50 border-l-4 border-l-primary-500 text-primary-900 dark:text-primary-300 shadow-2xs font-semibold"
                          : "hover:bg-dark-50 dark:hover:bg-slate-800 text-dark-700 dark:text-slate-300"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-bold leading-tight">
                          {s.title || "Untitled conversation"}
                        </div>
                        <div className="mt-0.5 text-[10px] text-dark-400 dark:text-slate-500">
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
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-dark-300 dark:text-slate-500 opacity-0 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-600 group-hover:opacity-100 transition-all disabled:opacity-40"
                      >
                        <FontAwesomeIcon icon={faTrash} className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chat Messages List (with centered reading column in fullscreen) */}
            <div ref={list_ref} className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 scroll-smooth">
              <div className={`flex flex-col gap-3 w-full ${expanded ? "max-w-3xl mx-auto" : ""}`}>
                {thinking_text && (
                  answer_started || !streaming ? (
                    /* folded reasoning block */
                    <div className="self-start">
                      <button
                        type="button"
                        onClick={() => setThinkingCollapsed((c) => !c)}
                        className="flex items-center gap-1.5 rounded-full border border-dark-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-dark-600 dark:text-slate-300 shadow-2xs transition-all hover:bg-dark-50 dark:hover:bg-slate-700 hover:border-primary-300"
                      >
                        <FontAwesomeIcon icon={faBrain} className="h-3 w-3 text-primary-500" />
                        <span>Reasoning</span>
                        <FontAwesomeIcon
                          icon={faChevronDown}
                          className={`h-2.5 w-2.5 text-dark-400 transition-transform duration-200 ${thinking_collapsed ? "" : "rotate-180"}`}
                        />
                      </button>
                      {!thinking_collapsed && (
                        <div className="mt-1.5 max-w-[90%] whitespace-pre-wrap rounded-xl rounded-bl-sm border border-dark-200 dark:border-slate-700 bg-dark-50 dark:bg-slate-950 p-3 text-xs italic font-mono leading-relaxed text-dark-600 dark:text-slate-400 shadow-2xs">
                          {thinking_text}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* live reasoning indicator */
                    <div className="flex items-center gap-2 self-start rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/60 px-3.5 py-2 text-xs font-semibold text-primary-700 dark:text-primary-300 shadow-2xs">
                      <FontAwesomeIcon icon={faBrain} className="h-3.5 w-3.5 animate-pulse text-primary-600" />
                      <span>Analyzing plan parameters…</span>
                    </div>
                  )
                )}

                {items.length === 0 && !streaming && (
                  <div className="m-auto flex w-full max-w-[26rem] flex-col gap-4 py-6 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 dark:bg-primary-950/60 border border-primary-200/80 dark:border-primary-800/60 text-primary-600 dark:text-primary-400 shadow-xs">
                        <FontAwesomeIcon icon={faRobot} className="h-6 w-6" />
                      </div>
                      <div className="text-base font-bold text-dark-900 dark:text-white">How can I assist your plan?</div>
                      <div className="text-xs leading-relaxed text-dark-500 dark:text-slate-400 max-w-xs">
                        I can calculate financial runways, simulate what-if scenarios, optimize taxes, and adjust budget allocations.
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 text-left">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-dark-400 dark:text-slate-500 px-1">Suggested prompts:</span>
                      {starter_prompts.map((s, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => SendMessage(s.text)}
                          className="flex items-center justify-between gap-2 rounded-xl border border-dark-200 dark:border-slate-750 bg-white dark:bg-slate-800 p-3 text-xs text-dark-700 dark:text-slate-200 shadow-2xs transition-all hover:border-primary-400 hover:bg-primary-50/40 dark:hover:bg-slate-750 hover:text-primary-800 dark:hover:text-primary-300 hover:shadow-xs group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-dark-50 dark:bg-slate-700 text-dark-500 dark:text-slate-300 group-hover:bg-primary-100 dark:group-hover:bg-primary-900 group-hover:text-primary-700 transition-colors">
                              <FontAwesomeIcon icon={s.icon} className="text-[10px]" />
                            </div>
                            <span className="truncate font-medium">{s.text}</span>
                          </div>
                          <FontAwesomeIcon icon={faChevronRight} className="text-[10px] text-dark-300 dark:text-slate-500 group-hover:text-primary-600 transition-colors shrink-0" />
                        </button>
                      ))}
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
                        className={`flex flex-col gap-1.5 ${is_user ? "items-end" : "items-start"}`}
                      >
                        <div
                          className={`rounded-2xl text-sm leading-relaxed ${
                            is_user
                              ? "max-w-[82%] rounded-tr-xs bg-primary-600 text-white px-4 py-2.5 shadow-xs font-medium"
                              : "max-w-[92%] rounded-tl-xs bg-white dark:bg-slate-800 border border-dark-200 dark:border-slate-700 px-4 py-3 text-dark-800 dark:text-slate-100 shadow-xs"
                          }`}
                        >
                          {is_user ? (
                            <div className="whitespace-pre-wrap">{item.content}</div>
                          ) : is_streaming_item ? (
                            <div className="whitespace-pre-wrap">
                              {item.content}
                              <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse rounded-full bg-primary-500 align-middle" />
                            </div>
                          ) : (
                            <MarkdownText text={item.content} />
                          )}

                          {!is_user && item.references && item.references.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-dark-100 dark:border-slate-700 pt-2.5">
                              {item.references.map((ref) => (
                                <button
                                  key={ref.href}
                                  type="button"
                                  onClick={() => router.push(ref.href)}
                                  className="flex items-center gap-1.5 rounded-full border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/60 px-2.5 py-1 text-xs font-semibold text-primary-700 dark:text-primary-300 shadow-2xs hover:bg-primary-100 dark:hover:bg-primary-900 transition-colors"
                                >
                                  <FontAwesomeIcon icon={ref_icon[ref.type]} className="h-2.5 w-2.5" />
                                  {ref.label}
                                </button>
                              ))}
                            </div>
                          )}

                          {!is_user && (
                            <div className="mt-2 flex justify-end">
                              <CopyButton text={item.content} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-1.5 self-start rounded-full border px-3 py-1 text-xs font-semibold shadow-2xs ${tool_badge[item.status]}`}
                      title={item.error || undefined}
                    >
                      {item.status === "running" ? (
                        <Spinner className="h-3 w-3 text-amber-600" />
                      ) : item.status === "ok" ? (
                        <FontAwesomeIcon icon={faCheck} className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <FontAwesomeIcon icon={faXmark} className="h-3 w-3 text-rose-600" />
                      )}
                      <FontAwesomeIcon icon={faWrench} className="h-2.5 w-2.5 opacity-60" />
                      <span>{item.name}</span>
                    </div>
                  );
                })}

                {streaming && !items.some((i) => i.kind === "message" && i.role === "assistant" && (i as any).streaming) && (
                  <div className="flex items-center gap-2 self-start rounded-xl border border-dark-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-medium text-dark-500 dark:text-slate-400 shadow-2xs">
                    <Spinner className="h-3 w-3 text-primary-600" />
                    <span>Thinking…</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mx-3.5 mb-2 flex items-center justify-between gap-2 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 px-3.5 py-2 text-xs text-rose-700 dark:text-rose-300 shadow-xs">
              <span>{error}</span>
              <div className="flex shrink-0 items-center gap-1.5">
                {last_user_ref.current && !streaming && (
                  <button
                    type="button"
                    aria-label="Retry last message"
                    onClick={() => RetryLast()}
                    className="flex items-center gap-1 rounded-md bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800 px-2 py-1 text-xs font-bold text-rose-700 dark:text-rose-300 shadow-2xs hover:bg-rose-100 transition-colors"
                  >
                    <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3" />
                    Retry
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Dismiss error"
                  className="flex h-5 w-5 items-center justify-center text-rose-500 hover:text-rose-700"
                  onClick={() => setError("")}
                >
                  <FontAwesomeIcon icon={faXmark} className="text-xs" />
                </button>
              </div>
            </div>
          )}

          {/* Lucid Input Row (centered in fullscreen) */}
          <div className="border-t border-dark-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
            <div className={`flex items-end gap-2 ${expanded ? "max-w-3xl mx-auto w-full" : ""}`}>
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
                className="max-h-24 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-dark-200 dark:border-slate-700 bg-dark-50/60 dark:bg-slate-950 px-3.5 py-2 text-sm text-dark-800 dark:text-slate-100 placeholder-dark-400 dark:placeholder-slate-500 focus:bg-white dark:focus:bg-slate-950 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-950 focus:outline-none transition-all"
              />

              {streaming ? (
                <button
                  type="button"
                  aria-label="Stop generating"
                  onClick={Stop}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-white shadow-xs hover:bg-rose-600 active:scale-95 transition-all animate-pulse"
                  title="Stop Generating"
                >
                  <FontAwesomeIcon icon={faStop} className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  aria-label="Send message"
                  disabled={!input.trim()}
                  onClick={() => SendMessage(input)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white shadow-xs hover:bg-primary-700 active:scale-95 transition-all disabled:opacity-30 disabled:hover:bg-primary-600"
                  title="Send Message"
                >
                  <FontAwesomeIcon icon={faPaperPlane} className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
