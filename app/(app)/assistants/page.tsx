"use client";

import { useMemo, useRef, useState } from "react";
import { Disclosure } from "@headlessui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRobot,
  faCopy,
  faCheck,
  faChevronDown,
  faGlobe,
  faTerminal,
  faDesktop,
  faKey,
  faArrowUpRightFromSquare,
} from "@fortawesome/free-solid-svg-icons";

/** Connect Fi-Plan to AI assistants (Claude, ChatGPT, GitHub Copilot, …) over MCP. */
export default function AssistantsPage() {
  const [copied, setCopied] = useState(false);
  const copy_timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const base = useMemo(() => (typeof window !== "undefined" ? window.location.origin : ""), []);
  const server_url = `${base}/api/mcp`;

  function CopyUrl() {
    if (!base) return;
    navigator.clipboard.writeText(server_url).catch(() => {});
    setCopied(true);
    if (copy_timer.current) clearTimeout(copy_timer.current);
    copy_timer.current = setTimeout(() => setCopied(false), 2000);
  }

  const card = "rounded-md border-2 border-dark-100 bg-dark-50 shadow-sm";
  const codeClass =
    "block w-full overflow-x-auto rounded-md bg-dark-100 border-2 border-dark-100 p-3 text-left text-xs sm:text-sm text-dark-500 whitespace-pre-wrap break-all";

  return (
    <div className="mx-auto mt-14 flex flex-col gap-4 px-4 pb-16 md:mt-0 md:w-[70%] md:px-0">
      <div className="flex flex-col gap-2 bg-slate-200 py-5 md:bg-dark-50">
        <div className="flex gap-3 px-4 md:px-0">
          <div className="grid h-[64px] w-[64px] place-content-center rounded-md border-2 border-dark-200 bg-dark-50">
            <FontAwesomeIcon icon={faRobot} className="text-3xl text-primary-500" />
          </div>
          <div className="mr-auto flex w-fit self-center justify-between overflow-clip">
            <div className="flex flex-col text-dark-500">
              <div className="text-left text-lg font-bold">AI Assistants (MCP)</div>
              <div className="flex flex-col text-xs text-dark-300">
                <div className="truncate">Connect Claude, ChatGPT, Copilot & more to your plans</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Server URL */}
      <div className={`${card} flex flex-col gap-2 p-4`}>
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-bold text-dark-500">MCP Server URL</div>
          <button
            type="button"
            onClick={CopyUrl}
            className="grid h-[2rem] place-content-center gap-2 rounded-[.5rem] border-2 border-primary-400 px-3 text-xs font-medium text-primary-400 transition-colors hover:bg-primary-500/10"
          >
            <span className="flex gap-2">
              <FontAwesomeIcon icon={copied ? faCheck : faCopy} className="self-center" />
              {copied ? "Copied!" : "Copy"}
            </span>
          </button>
        </div>
        <code className={codeClass}>{server_url || "Loading…"}</code>
        <div className="text-xs text-dark-300">
          Sign-in is handled via <b>OAuth</b> — the assistant opens your browser, you log in with your Fi-Plan
          email/password, and it stores the token automatically. No manual tokens to paste.
        </div>
      </div>

      {/* Claude.ai (web) */}
      <div className={card}>
        <Disclosure defaultOpen>
          {({ open }) => (
            <>
              <Disclosure.Button className="flex w-full items-center justify-between gap-2 p-4 text-left">
                <span className="flex gap-3">
                  <FontAwesomeIcon icon={faGlobe} className="self-center text-lg text-primary-500" />
                  <span className="flex flex-col">
                    <span className="text-sm font-bold text-dark-500">Claude (claude.ai web)</span>
                    <span className="text-xs text-dark-300">Customize → Connectors → Add custom connector</span>
                  </span>
                </span>
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className={`text-dark-400 transition-transform ${open ? "rotate-180" : ""}`}
                />
              </Disclosure.Button>
              <Disclosure.Panel className="flex flex-col gap-3 px-4 pb-4">
                <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-dark-400">
                  <li>
                    Open <b>claude.ai</b> → click your avatar → <b>Customize</b> → <b>Connectors</b>
                  </li>
                  <li>Click <b>“Add custom connector”</b></li>
                  <li>Paste the <b>MCP Server URL</b> above (from the Copy button)</li>
                  <li>Click <b>Add</b> — Claude discovers the server and shows a <b>“Sign in with Fi-Plan”</b> button</li>
                  <li>Complete the browser login with your Fi-Plan <b>email/password</b></li>
                  <li>
                    In any chat, click the <b>“+”</b> icon → <b>Connectors</b> → enable <b>Fi-Plan</b>
                  </li>
                </ol>
                <div className="rounded-md border-2 border-warning-100 bg-warning-100/40 p-3 text-xs text-dark-400">
                  <b>Team/Enterprise plan:</b> Organization settings → Connectors → Add → Custom → connector type{" "}
                  <b>Web</b> → URL → members connect from Customize → Connectors.
                </div>
              </Disclosure.Panel>
            </>
          )}
        </Disclosure>
      </div>

      {/* Claude Code (CLI) */}
      <div className={card}>
        <Disclosure>
          {({ open }) => (
            <>
              <Disclosure.Button className="flex w-full items-center justify-between gap-2 p-4 text-left">
                <span className="flex gap-3">
                  <FontAwesomeIcon icon={faTerminal} className="self-center text-lg text-primary-500" />
                  <span className="flex flex-col">
                    <span className="text-sm font-bold text-dark-500">Claude Code (CLI)</span>
                    <span className="text-xs text-dark-300">Terminal agents, scripts, automation</span>
                  </span>
                </span>
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className={`text-dark-400 transition-transform ${open ? "rotate-180" : ""}`}
                />
              </Disclosure.Button>
              <Disclosure.Panel className="flex flex-col gap-3 px-4 pb-4">
                <pre className={codeClass}>{`claude mcp add --transport http fi-plan ${server_url}
claude mcp list        # → "! Needs authentication"
claude mcp login fi-plan   # opens browser → sign in
/mcp                   # inside a session: Authenticate`}</pre>
                <div className="text-xs text-dark-300">
                  Requires Claude Code v2.1.229+. After sign-in the token is stored and refreshed automatically.
                </div>
              </Disclosure.Panel>
            </>
          )}
        </Disclosure>
      </div>

      {/* Claude Desktop */}
      <div className={card}>
        <Disclosure>
          {({ open }) => (
            <>
              <Disclosure.Button className="flex w-full items-center justify-between gap-2 p-4 text-left">
                <span className="flex gap-3">
                  <FontAwesomeIcon icon={faDesktop} className="self-center text-lg text-primary-500" />
                  <span className="flex flex-col">
                    <span className="text-sm font-bold text-dark-500">Claude Desktop</span>
                    <span className="text-xs text-dark-300">Settings → Developer → Edit Config</span>
                  </span>
                </span>
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className={`text-dark-400 transition-transform ${open ? "rotate-180" : ""}`}
                />
              </Disclosure.Button>
              <Disclosure.Panel className="flex flex-col gap-3 px-4 pb-4">
                <pre className={codeClass}>{`{
  "mcpServers": {
    "fi-plan": { "url": "${server_url}" }
  }
}`}</pre>
                <div className="text-xs text-dark-300">
                  Restart Claude Desktop → the connector shows a <b>Sign in</b> button → browser login.
                </div>
              </Disclosure.Panel>
            </>
          )}
        </Disclosure>
      </div>

      {/* Other assistants */}
      <div className={card}>
        <Disclosure>
          {({ open }) => (
            <>
              <Disclosure.Button className="flex w-full items-center justify-between gap-2 p-4 text-left">
                <span className="flex gap-3">
                  <FontAwesomeIcon icon={faRobot} className="self-center text-lg text-primary-500" />
                  <span className="flex flex-col">
                    <span className="text-sm font-bold text-dark-500">ChatGPT · GitHub Copilot · Cursor · Windsurf</span>
                    <span className="text-xs text-dark-300">Same MCP URL, same sign-in flow</span>
                  </span>
                </span>
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className={`text-dark-400 transition-transform ${open ? "rotate-180" : ""}`}
                />
              </Disclosure.Button>
              <Disclosure.Panel className="flex flex-col gap-3 px-4 pb-4">
                <div className="flex flex-col gap-1 text-sm text-dark-400">
                  <div className="font-bold text-dark-500">ChatGPT (web/app)</div>
                  <div>MCP connector → server URL → auth type <b>OAuth</b> → browser sign-in.</div>
                </div>
                <div className="flex flex-col gap-1 text-sm text-dark-400">
                  <div className="font-bold text-dark-500">GitHub Copilot (VS Code)</div>
                  <pre className={codeClass}>{`{ "github.copilot.chat.mcp.servers": {
    "fi-plan": { "type": "http", "url": "${server_url}" } } }`}</pre>
                </div>
                <div className="flex flex-col gap-1 text-sm text-dark-400">
                  <div className="font-bold text-dark-500">Cursor</div>
                  <pre className={codeClass}>{`{ "mcpServers": {
    "fi-plan": { "type": "http", "url": "${server_url}" } } }`}</pre>
                </div>
              </Disclosure.Panel>
            </>
          )}
        </Disclosure>
      </div>

      {/* API tokens */}
      <div className={card}>
        <Disclosure>
          {({ open }) => (
            <>
              <Disclosure.Button className="flex w-full items-center justify-between gap-2 p-4 text-left">
                <span className="flex gap-3">
                  <FontAwesomeIcon icon={faKey} className="self-center text-lg text-primary-500" />
                  <span className="flex flex-col">
                    <span className="text-sm font-bold text-dark-500">API tokens (for scripts / CLI agents)</span>
                    <span className="text-xs text-dark-300">Alternative to OAuth — create on the Profile page</span>
                  </span>
                </span>
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className={`text-dark-400 transition-transform ${open ? "rotate-180" : ""}`}
                />
              </Disclosure.Button>
              <Disclosure.Panel className="flex flex-col gap-3 px-4 pb-4">
                <div className="text-sm text-dark-400">
                  Scripts and non-interactive agents can authenticate with a static API token instead of the browser
                  OAuth flow:
                </div>
                <pre className={codeClass}>{`Authorization: Bearer fp_<token>`}</pre>
                <button
                  type="button"
                  onClick={() => (window.location.href = "/profile")}
                  className="grid h-[2.2rem] w-fit place-content-center gap-2 rounded-[.5rem] border-2 border-primary-400 px-4 text-xs font-medium text-primary-400 transition-colors hover:bg-primary-500/10"
                >
                  <span className="flex gap-2">
                    <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="self-center" />
                    Manage API tokens (Profile)
                  </span>
                </button>
              </Disclosure.Panel>
            </>
          )}
        </Disclosure>
      </div>
    </div>
  );
}
