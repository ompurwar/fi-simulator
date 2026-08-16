"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faKey,
  faChevronDown,
  faCopy,
  faTrashCan,
  faXmark,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";
import { Disclosure } from "@headlessui/react";
import { api, type ApiToken } from "@/lib/api";
import { Button } from "@/components/ui/Button";

/** Same input styling as the profile page (Update Password form). */
const inputClass = `px-3 py-[.25rem] border-[1.6px] rounded-[.5rem] shadow-sm w-full placeholder-dark-500 text-dark-400 text-left focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-300 focus:shadow-primary-500 bg-dark-50 flex justify-between transition-all duration-200 text-[1.25rem] appearance-none`;

/** moment(timestamp) formatting matching the profile page's FormatTime. */
function FormatCreatedAt(timestamp: number) {
  const d = new Date(timestamp);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d.toDateString() === now.toDateString()) {
    return `Today at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  if (d.getFullYear() === now.getFullYear()) {
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  }
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
}

/** API token management — create (one-time reveal), list, revoke. */
export function ApiTokens() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading_list, setLoadingList] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<{ name: string; api_token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [revoking_id, setRevokingId] = useState("");
  const copy_timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const LoadTokens = useCallback(async () => {
    setLoadingList(true);
    try {
      const list = await api.ListApiTokens();
      setTokens(list || []);
    } catch (e: any) {
      setError(e.message || "Failed to load API tokens");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    LoadTokens();
  }, [LoadTokens]);

  useEffect(() => {
    return () => {
      if (copy_timer.current) clearTimeout(copy_timer.current);
    };
  }, []);

  async function CreateToken(e: React.FormEvent) {
    e.preventDefault();
    const token_name = name.trim();
    if (!token_name || creating) return;
    setCreating(true);
    setError("");
    try {
      const res = await api.CreateApiToken(token_name);
      setRevealed({ name: token_name, api_token: res.api_token });
      setName("");
      await LoadTokens();
    } catch (e: any) {
      setError(e.message || "Failed to create API token");
    } finally {
      setCreating(false);
    }
  }

  async function CopyToken() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.api_token);
      setCopied(true);
      if (copy_timer.current) clearTimeout(copy_timer.current);
      copy_timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — leave the token visible to copy manually */
    }
  }

  async function RevokeToken(token: ApiToken) {
    if (!window.confirm(`Revoke API token "${token.name}"? Any agent using it will lose access immediately.`)) return;
    setRevokingId(token._id);
    setError("");
    try {
      await api.RevokeApiToken(token._id);
      setTokens((prev) => prev.filter((t) => t._id !== token._id));
    } catch (e: any) {
      setError(e.message || "Failed to revoke API token");
    } finally {
      setRevokingId("");
    }
  }

  const status_badge: Record<string, string> = {
    active: "bg-success-100 text-success-600",
    deleted: "bg-dark-100 text-dark-400",
  };

  return (
    <Disclosure as="div" className="w-full">
      {({ open }) => (
        <>
          <Disclosure.Button
            className={`flex w-full justify-between rounded-lg bg-dark-100 px-4 py-4 text-left text-sm font-semibold text-dark-500 shadow-sm hover:bg-dark-200 md:py-2 ${open ? "mb-2" : "mb-3"}`}
          >
            <div className="flex gap-2 text-xl self-center">
              <FontAwesomeIcon icon={faKey} className="mr-1 self-center" />
              <div className="self-center">API Tokens</div>
            </div>
            <FontAwesomeIcon icon={faChevronDown} className={`h-4 w-4 self-center text-dark-400 ${open ? "rotate-180 transform" : ""}`} />
          </Disclosure.Button>

          <Disclosure.Panel className="mb-3 rounded-b-xl rounded-t-md border p-4 text-sm text-gray-500 transition-all duration-150">
            <form onSubmit={CreateToken}>
              <div className="mb-1 flex text-xl font-medium">
                <div>Create new API token</div>
              </div>
              <div className="mb-3 text-xs text-dark-300">
                Tokens let external AI agents (MCP clients) access your plans. The raw token is shown only once at creation.
              </div>
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="w-full md:flex-1">
                  <span className="text-sm text-dark-300">Token name </span>
                  <input
                    type="text"
                    placeholder="e.g. claude-code"
                    className={inputClass}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-fit px-4 py-1"
                  variant="primary"
                  sub_variant="solid"
                  disabled={!name.trim() || creating}
                >
                  Create
                  {creating && (
                    <svg className="mr-3 -ml-1 h-5 w-5 animate-spin self-center text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                </Button>
              </div>
            </form>

            {error && <div className="mt-3 text-sm text-danger-500">{error}</div>}

            {revealed && (
              <div className="mt-4 rounded-lg border border-primary-300 bg-primary-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-dark-500">
                    Token created for "{revealed.name}" — copy it now, it won't be shown again
                  </span>
                  <button
                    type="button"
                    aria-label="Dismiss token"
                    className="text-dark-300 hover:text-dark-500"
                    onClick={() => setRevealed(null)}
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md bg-dark-900 px-2 py-1 text-xs text-primary-200">
                    {revealed.api_token}
                  </code>
                  <Button type="button" variant="primary" sub_variant="outline" size="sm" className="px-2" onClick={CopyToken}>
                    {copied ? <FontAwesomeIcon icon={faCheck} /> : <FontAwesomeIcon icon={faCopy} />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            )}

            <hr className="my-3" />

            <div className="mb-2 flex text-xl font-medium">
              <div>My API tokens</div>
            </div>
            {loading_list ? (
              <svg className="-ml-1 h-[20px] w-[20px] animate-spin self-center text-dark-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : tokens.length === 0 ? (
              <div className="text-sm text-dark-300">No API tokens yet.</div>
            ) : (
              <ul className="flex flex-col gap-2">
                {tokens.map((token) => (
                  <li
                    key={token._id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-dark-50 px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold text-dark-500">{token.name}</span>
                      <span className="text-xs text-dark-300">Created {FormatCreatedAt(token.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status_badge[token.status] || status_badge.deleted}`}>
                        {token.status}
                      </span>
                      <Button
                        type="button"
                        variant="danger"
                        sub_variant="outline"
                        size="sm"
                        className="px-2"
                        onClick={() => RevokeToken(token)}
                        disabled={revoking_id === token._id}
                      >
                        {revoking_id === token._id ? (
                          <svg className="-ml-1 h-[14px] w-[14px] animate-spin self-center" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <FontAwesomeIcon icon={faTrashCan} />
                        )}
                        Revoke
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Disclosure.Panel>
        </>
      )}
    </Disclosure>
  );
}
