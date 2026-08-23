"use client";

/** Amortization table for a loan (view_loan stage). Client-side port of the
 *  engine's ComputeLoanAmortizationScheduleWithPrepayments so unsaved edits
 *  preview live. Styling matches the app's LoanCard language. */

import { useMemo, useState } from "react";
import { DisplayAmount } from "@/components/ui/Button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faTableList } from "@fortawesome/free-solid-svg-icons";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function GetMMYYYY(month: number, plan_timestamp?: string | number) {
  const start = new Date(plan_timestamp || Date.now());
  const d = new Date(start.getFullYear(), start.getMonth() + (month - 1), 1);
  return `${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

function ComputeLoanEMI(principal: number, interest_rate: number, tenure_months: number): number {
  const r = interest_rate / 1200;
  const n = tenure_months;
  if (r === 0) return principal / n;
  const factor = Math.pow(1 + r, n);
  return (principal * r * factor) / (factor - 1);
}

const FREQ_PERIODS: Record<string, number> = { m: 1, q: 3, y: 12 };

function ComputePrepaymentAmounts(
  prepayments: any[],
  from_month: number,
  to_month: number
): Record<number, number> {
  const out: Record<number, number> = {};
  for (const p of prepayments || []) {
    if (!p || typeof p.amount !== "number" || p.amount <= 0) continue;
    const step = typeof p.step_pct === "number" && Number.isFinite(p.step_pct) ? p.step_pct : 0;
    const step_period = p.step_frequency
      ? FREQ_PERIODS[p.step_frequency]
      : p.frequency
        ? FREQ_PERIODS[p.frequency]
        : 0;
    const period = p.frequency ? FREQ_PERIODS[p.frequency] : 0;
    const months = period > 0 ? to_month : p.start_month;
    for (let m = p.start_month; m <= months; m += Math.max(1, period)) {
      if (m < from_month) continue;
      const k = step_period > 0 ? Math.floor((m - p.start_month) / step_period) : 0;
      out[m] = (out[m] || 0) + p.amount * Math.pow(1 + step / 100, k);
    }
  }
  return out;
}

function ComputeSchedule(principal: number, interest_rate: number, tenure: number, prepayments: any[]) {
  const r = interest_rate / 1200;
  const emi = ComputeLoanEMI(principal, interest_rate, tenure);
  const prepay_map = ComputePrepaymentAmounts(prepayments, 1, tenure);
  const rows: any[] = [];
  let balance = principal;
  let total_emi = 0;
  let total_interest = 0;
  let total_principal = 0;
  let total_prepaid = 0;
  let payoff = tenure;
  for (let i = 0; i < tenure; i++) {
    const interest_amount = balance * r;
    const principal_amount = emi - interest_amount;
    total_emi += emi;
    total_interest += interest_amount;
    total_principal += principal_amount;
    balance = balance - principal_amount;
    const prepayment = Math.min(prepay_map[i + 1] || 0, Math.max(0, balance));
    if (prepayment > 0) {
      balance -= prepayment;
      total_prepaid += prepayment;
    }
    rows.push({ seq: i, emi_paid: emi, interest_amount, principal_amount, prepayment, closing_balance: balance });
    if (balance <= 0.005) {
      payoff = i + 1;
      break;
    }
  }
  let original_interest = 0;
  {
    let b = principal;
    for (let i = 0; i < tenure; i++) {
      const it = b * r;
      original_interest += it;
      b -= emi - it;
    }
  }
  return {
    rows,
    payoff,
    total_emi,
    total_interest,
    total_principal,
    total_prepaid,
    interest_saved: Math.max(0, original_interest - total_interest),
  };
}

const PAGE_SIZE = 12;

export function LoanAmortizationTable({ plan, loan }: { plan: any; loan: any }) {
  const [page, setPage] = useState(0);

  const schedule = useMemo(() => {
    const tenure = Math.max(1, loan.end_month - loan.start_month + 1);
    // stored prepayment months are plan-absolute; the schedule math is loan-relative
    const relative = (loan.prepayments || [])
      .map((p: any) => ({ ...p, start_month: p.start_month - loan.start_month + 1 }))
      .filter((p: any) => p.start_month >= 1);
    return ComputeSchedule(loan.principal_amount || 0, loan.interest_rate || 0, tenure, relative);
  }, [loan]);

  const total_pages = Math.max(1, Math.ceil(schedule.rows.length / PAGE_SIZE));
  const page_start = page * PAGE_SIZE;
  const page_rows = schedule.rows.slice(page_start, page_start + PAGE_SIZE);
  const has_prepayments = (loan.prepayments || []).length > 0;
  const paid_early = has_prepayments && schedule.payoff < schedule.rows.length;

  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-dark-200 bg-white p-3 shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-2 self-center font-semibold text-dark-700">
          <FontAwesomeIcon icon={faTableList} className="self-center text-lg text-primary-500" />
          <span className="self-center">Amortization Schedule</span>
        </div>
        {paid_early && (
          <div className="ml-auto flex gap-2 self-center rounded-md bg-success-50 border border-success-200 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-success-600">
            <span>Paid off in {schedule.payoff} of {schedule.rows.length} months</span>
            <span className="text-dark-300">·</span>
            <span>Interest saved ₹{Math.round(schedule.interest_saved).toLocaleString("en-IN")}</span>
          </div>
        )}
      </div>

      <div className="max-h-[260px] overflow-y-auto rounded-lg border border-dark-100">
        <table className="w-full text-right text-xs tabular-nums">
          <thead className="sticky top-0 z-10 bg-dark-50">
            <tr className="border-b border-dark-200 text-[10px] uppercase tracking-wider text-dark-500">
              <th className="py-2 pl-2 text-left font-semibold">#</th>
              <th className="py-2 text-left font-semibold">Date</th>
              <th className="py-2 font-semibold">EMI</th>
              <th className="py-2 font-semibold text-danger-500">Interest</th>
              <th className="py-2 font-semibold text-primary-600">Principal</th>
              {has_prepayments && <th className="py-2 font-semibold text-success-600">Prepay</th>}
              <th className="py-2 pr-2 font-semibold">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-100">
            {page_rows.map((row: any) => (
              <tr key={row.seq} className="text-dark-600 transition-colors hover:bg-dark-50/70">
                <td className="py-1.5 pl-2 text-left font-medium text-dark-400">{row.seq + 1}</td>
                <td className="py-1.5 text-left text-[11px] font-medium text-dark-500">
                  {GetMMYYYY(loan.start_month + row.seq, plan.timestamp)}
                </td>
                <td className="py-1.5 font-medium text-dark-700">
                  <DisplayAmount amount={row.emi_paid} />
                </td>
                <td className="py-1.5 font-medium text-danger-500">
                  <DisplayAmount amount={row.interest_amount} />
                </td>
                <td className="py-1.5 font-medium text-primary-600">
                  <DisplayAmount amount={row.principal_amount} />
                </td>
                {has_prepayments && (
                  <td className="py-1.5 font-semibold text-success-600">
                    {row.prepayment > 0 ? <DisplayAmount amount={row.prepayment} /> : <span className="text-dark-300">—</span>}
                  </td>
                )}
                <td className="py-1.5 pr-2 font-semibold text-dark-800">
                  <DisplayAmount amount={Math.max(0, row.closing_balance)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-dark-100 pt-2 text-[11px] tracking-wide text-dark-500">
        <span className="flex gap-1">
          <span className="self-center text-dark-400">Total Paid:</span>
          <DisplayAmount className="self-center font-bold text-dark-700" amount={schedule.total_emi} />
        </span>
        <span className="flex gap-1">
          <span className="self-center text-dark-400">Interest:</span>
          <DisplayAmount className="self-center font-bold text-danger-500" amount={schedule.total_interest} />
        </span>
        <span className="flex gap-1">
          <span className="self-center text-dark-400">Principal:</span>
          <DisplayAmount className="self-center font-bold text-primary-600" amount={schedule.total_principal} />
        </span>
        {has_prepayments && (
          <span className="flex gap-1">
            <span className="self-center text-dark-400">Prepaid:</span>
            <DisplayAmount className="self-center font-bold text-success-600" amount={schedule.total_prepaid} />
          </span>
        )}
        <span className="ml-auto flex gap-1">
          <span className="self-center text-dark-400">Remaining:</span>
          <DisplayAmount className="self-center font-bold text-dark-800" amount={Math.max(0, schedule.rows[schedule.rows.length - 1]?.closing_balance || 0)} />
        </span>
      </div>

      {total_pages > 1 && (
        <div className="flex items-center justify-between border-t border-dark-100 pt-2 text-[11px] text-dark-500">
          <div className="self-center font-medium">
            Page {page + 1} of {total_pages} (Months {page_start + 1}–{Math.min(page_start + PAGE_SIZE, schedule.rows.length)})
          </div>
          <div className="flex gap-2 self-center">
            <button
              className="rounded-md border border-dark-200 bg-dark-50 px-2.5 py-1 text-dark-600 transition-all duration-200 hover:border-primary-400 hover:bg-white hover:text-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <FontAwesomeIcon icon={faChevronLeft} className="self-center text-xs" />
            </button>
            <button
              className="rounded-md border border-dark-200 bg-dark-50 px-2.5 py-1 text-dark-600 transition-all duration-200 hover:border-primary-400 hover:bg-white hover:text-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => setPage((p) => Math.min(total_pages - 1, p + 1))}
              disabled={page >= total_pages - 1}
            >
              <FontAwesomeIcon icon={faChevronRight} className="self-center text-xs" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}