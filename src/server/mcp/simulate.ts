/** What-if scenario patching — pure, never mutates the input plan. */

import { DeepCopy } from "../engine/utils";
import {
  GenerateRandomString,
  MakeCashFlow,
  MakeCashFlowChange,
  MakeFundDistributionPercentage,
  MakeLoanAccount,
} from "../domain/entities";
import { CASHFLOW_CHANGE_CONSTANTS, LOAN_CONSTANTS } from "../domain/constants";
import { InvalidPropertyError } from "../domain/errors";

/** Default end month for open-ended cashflows/changes — far beyond any plan duration. */
const ONGOING_MONTHS = 1200;

type PatchApplicator = (plan: any, patch: any) => void;

function ApplyAddCashflow(plan: any, patch: any, category: "i" | "e"): void {
  const cashflow = patch.cashflow;
  if (!cashflow || typeof cashflow !== "object")
    throw new InvalidPropertyError(
      `invalid: ${category === "i" ? "add_income" : "add_expense"} patches need a nested "cashflow" object (desc, amount, start_month, end_month) — ${PATCH_SCHEMA_HINT}`
    );

  if (cashflow.category !== undefined && cashflow.category !== category)
    throw new InvalidPropertyError("invalid: cashflow category does not match op");

  const { desc, amount, start_month, end_month, frequency } = cashflow;
  const end = end_month === undefined ? start_month + ONGOING_MONTHS : end_month;
  let type: "o" | "p";
  let freq: "m" | "y" | "q" | "h" | null;
  if (frequency !== undefined && frequency !== null) {
    type = "p";
    freq = frequency;
  } else if (end === start_month) {
    type = "o";
    freq = null;
  } else {
    type = "p";
    freq = "m";
  }

  const entry = MakeCashFlow({
    _id: GenerateRandomString(6),
    category,
    type,
    frequency: freq,
    amount,
    desc,
    start_month,
    end_month: end,
    active: true,
    primary: false,
  });

  plan.cashflow_list = plan.cashflow_list || [];
  plan.cashflow_list.push(entry);
}

function ApplyAddCashflowChange(plan: any, patch: any): void {
  const change = patch.change;
  if (!change || typeof change !== "object")
    throw new InvalidPropertyError(
      `invalid: add_cashflow_change patches need a nested "change" object — ${PATCH_SCHEMA_HINT}`
    );

  const { cashflow_id, change_desc, value, start_month, change_category, change_type } = change;
  const cashflow_exists = (plan.cashflow_list || []).some((cf: any) => cf._id === cashflow_id);
  if (!cashflow_exists)
    throw new InvalidPropertyError("assign of cashflow-changes to non existing cashflow");

  const entry = MakeCashFlowChange({
    cashflow_id,
    category: change_category,
    change_type: change_type ?? CASHFLOW_CHANGE_CONSTANTS.TYPE.PERCENTAGE,
    value,
    title: change_desc || "Cashflow change",
    desc: change_desc || "",
    start_month,
    end_month: change.end_month === undefined ? start_month + ONGOING_MONTHS : change.end_month,
    frequency: change.frequency ?? CASHFLOW_CHANGE_CONSTANTS.FREQUENCY.MONTHLY,
    active: true,
  });

  // Same replace semantics as the add_cashflow_change tool: the engine applies
  // only the FIRST change per (line, start_month, category), so a scenario
  // change overrides an existing one instead of being silently shadowed.
  plan.cashflow_change_list = plan.cashflow_change_list || [];
  const sameMonth = plan.cashflow_change_list.filter(
    (x: any) =>
      String(x.cashflow_id) === String(cashflow_id) &&
      x.start_month === start_month &&
      x.category === (change_category ?? entry.category)
  );
  plan.cashflow_change_list = plan.cashflow_change_list.filter(
    (x: any) => !sameMonth.includes(x)
  );
  plan.cashflow_change_list.push(entry);
}

function ApplyAddLoan(plan: any, patch: any): void {
  const loan = patch.loan;
  if (!loan || typeof loan !== "object")
    throw new InvalidPropertyError(
      `invalid: add_loan patches need a nested "loan" object — ${PATCH_SCHEMA_HINT}`
    );

  // Accept both vocabularies: the patch-native (amount + tenure) and the
  // add_loan-tool shape (principal_amount + end_month).
  const amount = loan.amount ?? loan.principal_amount;
  const tenure =
    loan.tenure ??
    (loan.end_month !== undefined && loan.start_month !== undefined
      ? loan.end_month - loan.start_month + 1
      : undefined);
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0)
    throw new InvalidPropertyError("invalid: loan amount should be a positive number");
  if (typeof tenure !== "number" || !Number.isFinite(tenure) || tenure <= 0)
    throw new InvalidPropertyError("invalid: loan tenure should be a positive number");

  const start = loan.start_month ?? 1;
  const entry = MakeLoanAccount({
    title: loan.loan_name ?? loan.title ?? "Simulated Loan",
    principal_amount: amount,
    interest_rate: loan.interest_rate,
    start_month: start,
    end_month: loan.end_month ?? start + tenure - 1,
    type: loan.type ?? LOAN_CONSTANTS.TYPE.OTHER,
    ref_id: loan.parent_id ?? null,
    deposit_to_bank: loan.deposit_to_bank ?? false,
  });

  plan.loan_accounts = plan.loan_accounts || [];
  plan.loan_accounts.push(entry);
}

function ApplyAddFdp(plan: any, patch: any): void {
  const fdp = patch.fdp;
  if (!fdp || typeof fdp !== "object")
    throw new InvalidPropertyError("invalid: fdp should be an object");

  const { name, amount, interest_rate, tenure, start_month, account_id } = fdp;
  if (typeof tenure !== "number" || !Number.isFinite(tenure) || tenure <= 0)
    throw new InvalidPropertyError("invalid: fdp tenure should be a positive number");

  const start = start_month ?? 1;
  const entry = MakeFundDistributionPercentage({
    start_month: start,
    end_month: start + tenure - 1,
    s: 0,
    e: 0,
    i: 100,
    name: name || "Fixed Deposit",
    amount,
    interest_rate,
    account_id,
  });

  plan.fund_distribution_percentage = plan.fund_distribution_percentage || [];
  plan.fund_distribution_percentage.push(entry);
}

function ApplySetAccountBalance(plan: any, patch: any): void {
  const { account_id, month, balance } = patch;
  if (typeof account_id !== "string" || account_id.length === 0)
    throw new InvalidPropertyError("invalid: account_id is required");
  if (typeof month !== "number" || !Number.isFinite(month) || month < 1)
    throw new InvalidPropertyError("invalid: month should be a positive number");
  if (typeof balance !== "number" || !Number.isFinite(balance))
    throw new InvalidPropertyError("invalid: balance should be a number");

  const account = (plan.account_list || []).find((a: any) => a._id === account_id);
  if (!account) throw new InvalidPropertyError(`invalid: account not found with id ${account_id}`);

  account.init_balance = balance;
  account.balance_month = month;
}

const PATCH_APPLICATORS: Record<string, PatchApplicator> = {
  add_income: (plan, patch) => ApplyAddCashflow(plan, patch, "i"),
  add_expense: (plan, patch) => ApplyAddCashflow(plan, patch, "e"),
  add_cashflow_change: ApplyAddCashflowChange,
  add_loan: ApplyAddLoan,
  add_fdp: ApplyAddFdp,
  set_account_balance: ApplySetAccountBalance,
};

/**
 * Apply an ordered list of scenario patches to a deep copy of the plan.
 * The input plan is never mutated; every patch is validated against the same
 * domain entities the web app uses, so invalid fields throw InvalidPropertyError.
 * Error messages carry the expected patch shape so agents self-correct.
 */
export const PATCH_SCHEMA_HINT =
  'scenario patches look like: [{"op":"add_cashflow_change","change":{"cashflow_id":"<line _id>","change_category":"i|e","change_type":"p|f","value":10,"start_month":24}}, {"op":"add_income","cashflow":{"desc":"...","amount":30000,"start_month":12}}, {"op":"add_loan","loan":{"amount":400000,"interest_rate":9,"tenure":60,"start_month":24,"deposit_to_bank":false}}]';

export function ApplyScenarioToPlan(plan: any, patches: any[]): any {
  if (!plan || typeof plan !== "object")
    throw new InvalidPropertyError("invalid: plan should be an object");
  if (!Array.isArray(patches))
    throw new InvalidPropertyError(`invalid: patches should be an array — ${PATCH_SCHEMA_HINT}`);

  const scenario = DeepCopy(plan);

  patches.forEach((patch, index) => {
    const op = patch?.op;
    const apply = PATCH_APPLICATORS[op];
    if (!apply)
      throw new InvalidPropertyError(
        `invalid: unknown scenario op '${String(op)}' at index ${index} — ${PATCH_SCHEMA_HINT}`
      );
    apply(scenario, patch);
  });

  return scenario;
}
