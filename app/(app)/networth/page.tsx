"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Disclosure } from "@headlessui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faWallet,
  faLink,
  faArrowTrendUp,
  faArrowTrendDown,
  faChevronDown,
  faChevronLeft,
  faArrowRotateRight,
  faShieldHalved,
  faXmark,
  faUnlink,
  faCircleCheck,
  faCircleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { MyChart } from "@/components/ui/MyChart";
import { ModalUi } from "@/components/ui/ModalUi";
import {
  GetNetWorthStatus,
  ConnectNetWorth,
  SyncNetWorth,
  DisconnectNetWorth,
  sampleNetWorthStatus,
  NetWorthHolding,
  NetWorthSnapshot,
  NetWorthStatus,
} from "@/lib/networth";

const ASSET_COLORS: Record<string, string> = {
  "Indian Stocks": "#10b981",
  "Mutual Funds": "#059669",
  "US Stocks": "#5a9ba8",
  EPF: "#b48a56",
  NPS: "#c3a26f",
  "Fixed Deposits": "#34d399",
  "Savings & Liquid": "#8d9fb6",
  Gold: "#d2b98a",
  Loan: "#ef4444",
  "Credit Card": "#dc2626",
};

function fmtMoney(n: number) {
  return Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Math.abs(n)));
}

function fmtCompact(n: number) {
  const abs = Math.abs(n);
  const fmt = (v: number) =>
    `${Intl.NumberFormat("en-IN", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(v)}`;
  return n < 0 ? `-${fmt(abs)}` : fmt(abs);
}

function TimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.round(diff / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function NetWorthDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<NetWorthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [show_connect, setShowConnect] = useState(false);
  const [show_sample_note, setShowSampleNote] = useState(true);

  const connected = status?.connected ?? false;
  const callback_connected = searchParams.get("connected") === "1";
  const callback_error = searchParams.get("connected") === "error";
  const [dismiss_callback_banner, setDismissCallbackBanner] = useState(false);

  // not connected → render the static preview so the page still has shape
  const data = useMemo(() => (connected ? status! : sampleNetWorthStatus()), [connected, status]);

  const snapshot: NetWorthSnapshot | null = data.snapshot;
  const holdings: NetWorthHolding[] = data.holdings;
  const analysis = connected ? (status?.analysis ?? []) : [];
  const history = data.history;

  async function load() {
    try {
      setStatus(await GetNetWorthStatus());
    } catch (e: any) {
      setError(e?.message || "Failed to load net worth");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // right after the OAuth callback lands us back here, pull data once
  useEffect(() => {
    if (!callback_connected || callback_error) return;
    handleSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callback_connected, callback_error]);

  async function handleConnect() {
    setBusy(true);
    try {
      const { url } = await ConnectNetWorth();
      window.location.href = url;
    } catch (e: any) {
      setError(e?.message || "Could not start IndMoney connection");
      setBusy(false);
    }
  }

  async function handleSync() {
    setBusy(true);
    try {
      await SyncNetWorth();
      await load();
    } catch (e: any) {
      setError(e?.message || "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm("Disconnect IndMoney? Your saved snapshots stay, but live sync stops.")) return;
    setBusy(true);
    try {
      await DisconnectNetWorth();
      await load();
    } catch (e: any) {
      setError(e?.message || "Disconnect failed");
    } finally {
      setBusy(false);
    }
  }

  const allocation = useMemo(
    () => [...(snapshot?.allocation || [])].sort((a, b) => b.value - a.value),
    [snapshot]
  );

  const asset_holdings = useMemo(() => {
    const groups: Record<string, NetWorthHolding[]> = {};
    for (const h of holdings) {
      if (h.asset_class === "Loan" || h.asset_class === "Credit Card") continue;
      (groups[h.asset_class] ||= []).push(h);
    }
    return groups;
  }, [holdings]);

  const liabilities = useMemo(
    () =>
      holdings.filter((h) => h.asset_class === "Loan" || h.asset_class === "Credit Card"),
    [holdings]
  );

  const total_assets = snapshot?.total_assets || 0;
  const total_liabilities = snapshot?.total_liabilities || 0;
  const invested = snapshot?.invested || 0;
  const pnl = snapshot?.unrealized_pnl || 0;
  const net_worth = snapshot?.total_net_worth || 0;
  const pnl_pct = invested > 0 ? (pnl / invested) * 100 : 0;

  const doughnut_data = [
    {
      data: allocation.filter((a) => a.value > 0).map((a) => a.value),
      backgroundColor: allocation.filter((a) => a.value > 0).map((a) => ASSET_COLORS[a.asset_class]),
      borderWidth: 0,
      hoverOffset: 8,
    },
  ];

  const history_dataset = [
    {
      label: "Net worth",
      data: history.map((h) => h.value),
      borderColor: "#10b981",
      backgroundColor: "rgba(16,185,129,0.10)",
      fill: true,
      tension: 0.4,
      pointRadius: history.length <= 6 ? 3 : 0,
      pointHoverRadius: 5,
      borderWidth: 2,
    },
  ];

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-3 py-6 md:px-6 md:py-8">
        <div className="h-64 animate-pulse rounded-2xl bg-dark-100" />
        <div className="grid gap-5 md:grid-cols-5">
          <div className="h-80 animate-pulse rounded-2xl bg-dark-100 md:col-span-3" />
          <div className="h-80 animate-pulse rounded-2xl bg-dark-100 md:col-span-2" />
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-dark-100" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-3 py-6 md:px-6 md:py-8">
      {/* ---------- back ---------- */}
      <button
        onClick={() => router.back()}
        className="flex w-fit animate-fade-up items-center gap-2 rounded-full border border-dark-100 bg-dark-50 px-4 py-2 text-sm font-medium text-dark-500 transition-colors hover:bg-dark-100 hover:text-dark-700"
      >
        <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5" />
        Back
      </button>

      {/* ---------- callback banner ---------- */}
      {callback_connected && !dismiss_callback_banner && (
        <div className="flex animate-fade-up items-center gap-3 rounded-xl border border-success-300 bg-success-50 px-4 py-3 text-sm text-success-700">
          <FontAwesomeIcon icon={faCircleCheck} className="h-4 w-4 shrink-0" />
          <span className="font-medium">IndMoney connected!</span>
          <span className="text-success-600">Syncing your net worth now.</span>
          <button
            onClick={() => setDismissCallbackBanner(true)}
            className="ml-auto text-success-500 transition-colors hover:text-success-700"
            aria-label="Dismiss"
          >
            <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
          </button>
        </div>
      )}
      {callback_error && !dismiss_callback_banner && (
        <div className="flex animate-fade-up items-center gap-3 rounded-xl border border-danger-300 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          <FontAwesomeIcon icon={faCircleExclamation} className="h-4 w-4 shrink-0" />
          <span className="font-medium">Could not connect IndMoney.</span>
          <span className="text-danger-600">Please try again.</span>
          <button
            onClick={() => setDismissCallbackBanner(true)}
            className="ml-auto text-danger-500 transition-colors hover:text-danger-700"
            aria-label="Dismiss"
          >
            <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
          </button>
        </div>
      )}
      {error && !connected && (
        <div className="flex animate-fade-up items-center gap-3 rounded-xl border border-danger-300 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          <FontAwesomeIcon icon={faCircleExclamation} className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-danger-500 transition-colors hover:text-danger-700"
            aria-label="Dismiss"
          >
            <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ---------- hero ---------- */}
      <section className="relative animate-fade-up overflow-hidden rounded-2xl bg-gradient-to-br from-dark-800 via-dark-800 to-dark-900 p-6 shadow-xl md:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-accent-500/10 blur-3xl" />

        <div className="relative flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-300">
              <FontAwesomeIcon icon={faWallet} className="h-4 w-4" />
              Net Worth
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {connected ? (
                <span className="flex items-center gap-2 rounded-full border border-primary-400/40 bg-primary-500/10 px-3 py-1 text-[11px] font-medium text-primary-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-300" />
                  Connected · IndMoney
                </span>
              ) : (
                show_sample_note && (
                  <button
                    onClick={() => setShowSampleNote(false)}
                    className="group flex items-center gap-2 rounded-full border border-warning-500/40 bg-warning-500/10 px-3 py-1 text-[11px] font-medium text-warning-200 transition-colors hover:bg-warning-500/20"
                  >
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning-300" />
                    Sample preview
                    <FontAwesomeIcon icon={faXmark} className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                  </button>
                )
              )}
              {!connected && (
                <button
                  onClick={() => setShowConnect(true)}
                  className="flex items-center gap-2 rounded-full border border-primary-400/50 bg-primary-500/10 px-4 py-1.5 text-xs font-semibold text-primary-200 transition-all hover:bg-primary-500 hover:text-white"
                >
                  <FontAwesomeIcon icon={faLink} className="h-3.5 w-3.5" />
                  Connect IndMoney
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {connected ? (
              <div className="font-exo2 text-5xl font-bold tracking-tight text-white md:text-6xl">
                ₹{fmtMoney(net_worth)}
              </div>
            ) : (
              <div className="font-exo2 text-5xl font-bold tracking-tight text-white/80 md:text-6xl">
                ₹{fmtMoney(net_worth)}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-dark-300">Invested ₹{fmtMoney(invested)}</span>
              <span
                className={`flex items-center gap-1 font-semibold ${
                  pnl >= 0 ? "text-primary-300" : "text-danger-300"
                }`}
              >
                <FontAwesomeIcon icon={pnl >= 0 ? faArrowTrendUp : faArrowTrendDown} className="h-3.5 w-3.5" />
                {pnl >= 0 ? "+" : ""}₹{fmtMoney(pnl)} ({pnl_pct.toFixed(1)}%)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 border-t border-white/10 pt-5 md:max-w-lg">
            {[
              { label: "Assets", value: `₹${fmtMoney(total_assets)}`, tone: "text-primary-200" },
              { label: "Liabilities", value: `₹${fmtMoney(total_liabilities)}`, tone: "text-danger-200" },
              { label: "Unrealized P&L", value: `+₹${fmtMoney(pnl)}`, tone: "text-warning-200" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-[11px] uppercase tracking-wider text-dark-400">{s.label}</div>
                <div className={`mt-0.5 font-exo2 text-lg font-semibold ${s.tone}`}>{s.value}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-dark-400">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-400" />
              {connected
                ? `Last synced ${status?.last_sync_at ? TimeAgo(new Date(status.last_sync_at).toISOString()) : "never"}`
                : "Preview data"}
            </span>
            {connected ? (
              <>
                <button
                  onClick={handleSync}
                  disabled={busy}
                  className="flex items-center gap-1.5 transition-colors hover:text-primary-300 disabled:opacity-50"
                >
                  <FontAwesomeIcon
                    icon={faArrowRotateRight}
                    className={`h-3 w-3 ${busy ? "animate-spin" : ""}`}
                  />
                  {busy ? "Syncing..." : "Sync now"}
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={busy}
                  className="flex items-center gap-1.5 text-danger-300 transition-colors hover:text-danger-200 disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={faUnlink} className="h-3 w-3" />
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowConnect(true)}
                className="flex items-center gap-1.5 transition-colors hover:text-primary-300"
              >
                <FontAwesomeIcon icon={faLink} className="h-3 w-3" />
                Connect to see live data
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ---------- allocation + at-a-glance ---------- */}
      <section className="grid gap-5 md:grid-cols-5">
        {/* allocation doughnut */}
        <div className="card animate-fade-up rounded-2xl p-6 [animation-delay:80ms] md:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-exo2 text-lg font-bold text-dark-800">Asset Allocation</h2>
            <span className="rounded-full bg-dark-100 px-3 py-1 text-[11px] font-medium text-dark-500">
              {allocation.length} asset classes
            </span>
          </div>
          <div className="grid items-center gap-6 md:grid-cols-2">
            <div className="relative mx-auto h-52 w-52">
              <MyChart
                chart_type="doughnut"
                labels={allocation.filter((a) => a.value > 0).map((a) => a.asset_class)}
                dataset={doughnut_data}
                show_legend={false}
                formatter={(v) => `₹${fmtCompact(v)}`}
              />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] uppercase tracking-wider text-dark-400">Total assets</span>
                <span className="font-exo2 text-xl font-bold text-dark-800">₹{fmtCompact(total_assets)}</span>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {allocation.map((a) => {
                const pct = total_assets > 0 ? (a.value / total_assets) * 100 : 0;
                return (
                  <div key={a.asset_class} className="flex items-center gap-3">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: ASSET_COLORS[a.asset_class] }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium text-dark-600">{a.asset_class}</span>
                        <span className="flex shrink-0 items-baseline gap-2">
                          <span className="text-sm font-semibold text-dark-800">₹{fmtCompact(a.value)}</span>
                          <span
                            className={`text-[11px] font-medium ${
                              a.pnl >= 0 ? "text-success-600" : "text-danger-500"
                            }`}
                          >
                            {a.pnl >= 0 ? "+" : ""}
                            {a.pnl_pct.toFixed(1)}%
                          </span>
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-dark-100">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: ASSET_COLORS[a.asset_class],
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* at a glance */}
        <div className="card animate-fade-up rounded-2xl p-6 [animation-delay:160ms] md:col-span-2">
          <h2 className="mb-4 font-exo2 text-lg font-bold text-dark-800">At a Glance</h2>
          <dl className="flex flex-col gap-4">
            {[
              { label: "Net worth", value: net_worth, positive: true },
              { label: "Total assets", value: total_assets, positive: true },
              { label: "Total liabilities", value: total_liabilities, positive: false },
              { label: "Amount invested", value: invested, positive: true },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between border-b border-dark-100 pb-3 last:border-0 last:pb-0">
                <dt className="text-sm text-dark-400">{row.label}</dt>
                <dd
                  className={`font-exo2 text-lg font-semibold ${
                    row.positive ? "text-dark-800" : "text-danger-500"
                  }`}
                >
                  {row.positive ? "" : "−"}₹{fmtMoney(row.value)}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 flex items-start gap-3 rounded-xl bg-dark-50 p-4">
            <FontAwesomeIcon icon={faShieldHalved} className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
            <p className="text-xs leading-relaxed text-dark-400">
              Read-only data pulled from your linked accounts via the official IndMoney
              integration. Nothing can be traded or moved from here.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- net worth history ---------- */}
      <section className="card animate-fade-up rounded-2xl p-6 [animation-delay:240ms]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-exo2 text-lg font-bold text-dark-800">Net Worth History</h2>
          <span className="rounded-full bg-dark-100 px-3 py-1 text-[11px] font-medium text-dark-500">
            {connected ? `${history.length} snapshots` : "Sample"}
          </span>
        </div>
        <div className="h-64 md:h-72">
          <MyChart
            chart_type="line"
            labels={history.map((h) => h.month)}
            dataset={history_dataset}
            show_legend={false}
            formatter={(v) => `₹${fmtCompact(v)}`}
          />
        </div>
      </section>

      {/* ---------- us stocks analysis ---------- */}
      {connected && analysis.length > 0 && (
        <section className="card animate-fade-up rounded-2xl p-6 [animation-delay:280ms]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-exo2 text-lg font-bold text-dark-800">US Stocks Analysis</h2>
            <span className="rounded-full bg-accent-100 px-3 py-1 text-[11px] font-medium text-accent-700">
              Live prices · Analyst consensus
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-white text-left text-[11px] uppercase tracking-wider text-dark-400">
                  <th className="px-4 py-2.5 font-medium">Instrument</th>
                  <th className="px-4 py-2.5 text-right font-medium">Price</th>
                  <th className="px-4 py-2.5 text-right font-medium">Day range</th>
                  <th className="px-4 py-2.5 text-right font-medium">Consensus</th>
                  <th className="px-4 py-2.5 text-right font-medium">Target</th>
                  <th className="px-4 py-2.5 text-right font-medium">Upside</th>
                  <th className="px-4 py-2.5 font-medium">Latest</th>
                </tr>
              </thead>
              <tbody>
                {analysis.map((a) => (
                  <tr key={a.symbol} className="border-t border-dark-100/70 transition-colors hover:bg-dark-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-dark-700">{a.name || a.symbol}</div>
                      {a.symbol && a.name && (
                        <div className="text-[11px] text-dark-300">{a.symbol}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-dark-800">
                      {a.price === null ? "—" : `$${a.price.toFixed(2)}`}
                    </td>
                    <td className="px-4 py-3 text-right text-dark-500">
                      {a.day_low === null || a.day_high === null
                        ? "—"
                        : `$${a.day_low.toFixed(2)} – $${a.day_high.toFixed(2)}`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {a.analyst_consensus ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            /buy|strong buy|overweight/i.test(a.analyst_consensus)
                              ? "bg-success-100 text-success-700"
                              : /sell|underweight/i.test(a.analyst_consensus)
                                ? "bg-danger-100 text-danger-600"
                                : "bg-warning-100 text-warning-700"
                          }`}
                        >
                          {a.analyst_consensus}
                        </span>
                      ) : (
                        <span className="text-dark-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-dark-500">
                      {a.target_price === null ? "—" : `$${a.target_price.toFixed(2)}`}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${
                        (a.upside_pct ?? 0) >= 0 ? "text-success-600" : "text-danger-500"
                      }`}
                    >
                      {a.upside_pct === null ? "—" : `${a.upside_pct >= 0 ? "+" : ""}${a.upside_pct.toFixed(1)}%`}
                    </td>
                    <td className="max-w-[14rem] px-4 py-3">
                      {a.headline ? (
                        <div className="truncate text-dark-500" title={a.headline}>
                          {a.headline}
                        </div>
                      ) : a.sentiment ? (
                        <span className="text-dark-400">{a.sentiment}</span>
                      ) : (
                        <span className="text-dark-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---------- holdings ---------- */}
      <section className="card animate-fade-up rounded-2xl p-6 [animation-delay:320ms]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-exo2 text-lg font-bold text-dark-800">Holdings</h2>
          <span className="rounded-full bg-dark-100 px-3 py-1 text-[11px] font-medium text-dark-500">
            {holdings.length - liabilities.length} assets · {liabilities.length} liabilities
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {Object.entries(asset_holdings).map(([asset_class, rows]) => {
            const group_total = rows.reduce((sum, r) => sum + r.current_value, 0);
            const group_invested = rows.reduce((sum, r) => sum + r.invested, 0);
            const group_pnl = group_total - group_invested;
            const group_pct = group_invested !== 0 ? (group_pnl / group_invested) * 100 : 0;
            return (
              <Disclosure key={asset_class} defaultOpen={asset_class === "Indian Stocks"}>
                {({ open }) => (
                  <div className="overflow-hidden rounded-xl border border-dark-100">
                    <Disclosure.Button className="flex w-full items-center gap-3 bg-dark-50 px-4 py-3 text-left transition-colors hover:bg-dark-100/60">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: ASSET_COLORS[asset_class] }}
                      />
                      <span className="flex-1 text-sm font-semibold text-dark-700">{asset_class}</span>
                      <span className="hidden text-xs text-dark-400 sm:inline">
                        {rows.length} {rows.length === 1 ? "holding" : "holdings"}
                      </span>
                      <span className="text-sm font-semibold text-dark-800">₹{fmtCompact(group_total)}</span>
                      <span
                        className={`w-16 text-right text-xs font-medium ${
                          group_pnl >= 0 ? "text-success-600" : "text-danger-500"
                        }`}
                      >
                        {group_pnl >= 0 ? "+" : ""}
                        {group_pct.toFixed(1)}%
                      </span>
                      <FontAwesomeIcon
                        icon={faChevronDown}
                        className={`h-3.5 w-3.5 text-dark-400 transition-transform duration-200 ${
                          open ? "rotate-180" : ""
                        }`}
                      />
                    </Disclosure.Button>
                    <Disclosure.Panel className="animate-fade-up overflow-x-auto">
                      <table className="w-full min-w-[560px] text-sm">
                        <thead>
                          <tr className="bg-white text-left text-[11px] uppercase tracking-wider text-dark-400">
                            <th className="px-4 py-2.5 font-medium">Name</th>
                            <th className="px-4 py-2.5 text-right font-medium">Units</th>
                            <th className="px-4 py-2.5 text-right font-medium">Invested</th>
                            <th className="px-4 py-2.5 text-right font-medium">Current</th>
                            <th className="px-4 py-2.5 text-right font-medium">P&L</th>
                            <th
                              className="px-4 py-2.5 text-right font-medium"
                              title="Simple return % — IndMoney MCP does not populate XIRR"
                            >
                              Returns
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((h, idx) => {
                            const return_pct =
                              h.xirr !== null && h.xirr !== 0 ? h.xirr : h.pnl_pct;
                            return (
                            <tr
                              key={h.code ? `${h.code}-${idx}` : `${h.asset_class}-${h.name}-${idx}`}
                              className="border-t border-dark-100/70 transition-colors hover:bg-dark-50"
                            >
                              <td className="px-4 py-3">
                                <div className="font-medium text-dark-700">{h.name}</div>
                                {h.broker && (
                                  <div className="text-[11px] text-dark-300">{h.broker}</div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right text-dark-500">
                                {h.units === null ? "—" : h.units.toLocaleString("en-IN")}
                              </td>
                              <td className="px-4 py-3 text-right text-dark-500">
                                ₹{fmtMoney(h.invested)}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-dark-800">
                                ₹{fmtMoney(h.current_value)}
                              </td>
                              <td
                                className={`px-4 py-3 text-right font-medium ${
                                  h.pnl >= 0 ? "text-success-600" : "text-danger-500"
                                }`}
                              >
                                {h.pnl >= 0 ? "+" : ""}₹{fmtMoney(h.pnl)} ({h.pnl_pct.toFixed(1)}%)
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    return_pct >= 0
                                      ? "bg-success-100 text-success-700"
                                      : "bg-danger-100 text-danger-600"
                                  }`}
                                >
                                  {return_pct.toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </Disclosure.Panel>
                  </div>
                )}
              </Disclosure>
            );
          })}

          {liabilities.length > 0 && (
            <Disclosure key="liabilities">
              {({ open }) => {
                const total = liabilities.reduce((s, l) => s + l.current_value, 0);
                return (
                  <div className="overflow-hidden rounded-xl border border-danger-200">
                    <Disclosure.Button className="flex w-full items-center gap-3 bg-danger-50 px-4 py-3 text-left transition-colors hover:bg-danger-100/70">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-danger-500" />
                      <span className="flex-1 text-sm font-semibold text-danger-700">Liabilities</span>
                      <span className="hidden text-xs text-danger-400 sm:inline">
                        {liabilities.length} {liabilities.length === 1 ? "account" : "accounts"}
                      </span>
                      <span className="text-sm font-semibold text-danger-600">
                        −₹{fmtCompact(Math.abs(total))}
                      </span>
                      <FontAwesomeIcon
                        icon={faChevronDown}
                        className={`h-3.5 w-3.5 text-danger-400 transition-transform duration-200 ${
                          open ? "rotate-180" : ""
                        }`}
                      />
                    </Disclosure.Button>
                    <Disclosure.Panel className="animate-fade-up overflow-x-auto bg-white">
                      <table className="w-full min-w-[560px] text-sm">
                        <thead>
                          <tr className="text-left text-[11px] uppercase tracking-wider text-dark-400">
                            <th className="px-4 py-2.5 font-medium">Name</th>
                            <th className="px-4 py-2.5 text-right font-medium">Outstanding</th>
                            <th className="px-4 py-2.5 text-right font-medium">Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {liabilities.map((l, idx) => (
                            <tr
                              key={l.code ? `${l.code}-${idx}` : `${l.asset_class}-${l.name}-${idx}`}
                              className="border-t border-dark-100/70 hover:bg-danger-50/50"
                            >
                              <td className="px-4 py-3">
                                <div className="font-medium text-dark-700">{l.name}</div>
                                {l.broker && <div className="text-[11px] text-dark-300">{l.broker}</div>}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-danger-600">
                                ₹{fmtMoney(Math.abs(l.current_value))}
                              </td>
                              <td className="px-4 py-3 text-right text-dark-500">
                                {l.xirr === null ? "—" : `${l.xirr.toFixed(2)}%`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Disclosure.Panel>
                  </div>
                );
              }}
            </Disclosure>
          )}
        </div>
      </section>

      {/* ---------- connect modal ---------- */}
      <ModalUi show={show_connect} onClose={() => setShowConnect(false)} title="Connect IndMoney">
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-dark-500">
            This app pulls your net worth from the{" "}
            <span className="font-medium text-dark-700">official IndMoney MCP server</span> —
            the same read-only bridge IndMoney publishes for AI assistants.
          </p>
          <ol className="flex flex-col gap-3">
            {[
              "You sign in on IndMoney's own page (OTP + MPIN)",
              "Approve the consent screen listing exactly what's shared",
              "You'll be brought back here with your net worth synced",
            ].map((step, i) => (
              <li key={step} className="flex items-start gap-3 text-sm text-dark-500">
                <span className="grid h-6 w-6 shrink-0 place-content-center rounded-full bg-primary-100 font-exo2 text-xs font-bold text-primary-700">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <p className="rounded-xl bg-success-50 p-3 text-xs leading-relaxed text-success-600">
            Read-only by design — no trades, no transfers, no settings changes.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowConnect(false)}
              className="flex-1 rounded-xl border-2 border-dark-100 px-4 py-2.5 text-sm font-semibold text-dark-500 transition-colors hover:bg-dark-100"
            >
              Not now
            </button>
            <button
              onClick={handleConnect}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
            >
              <FontAwesomeIcon icon={faLink} className="h-4 w-4" />
              {busy ? "Starting..." : "Connect now"}
            </button>
          </div>
        </div>
      </ModalUi>
    </div>
  );
}

export default function NetWorthPage() {
  return (
    <Suspense>
      <NetWorthDashboard />
    </Suspense>
  );
}
