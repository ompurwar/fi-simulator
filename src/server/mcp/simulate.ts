/** What-if scenario patching — pure, never mutates the input plan. */

import { DeepCopy } from "../engine/utils";
import {
  GenerateRandomString,
  MakeAsset,
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
    prepayments: loan.prepayments ?? [],
  });

  plan.loan_accounts = plan.loan_accounts || [];
  plan.loan_accounts.push(entry);
}

const LOAN_EDITABLE_FIELDS = [
  "title",
  "principal_amount",
  "interest_rate",
  "start_month",
  "end_month",
  "deposit_to_bank",
  "type",
  "ref_id",
  "prepayments",
] as const;

function ApplyUpdateLoan(plan: any, patch: any): void {
  const { loan_id } = patch;
  if (typeof loan_id !== "string" || loan_id.length === 0)
    throw new InvalidPropertyError(
      `invalid: update_loan patches need a "loan_id" field — ${PATCH_SCHEMA_HINT}`
    );

  const loans = plan.loan_accounts || [];
  const idx = loans.findIndex((l: any) => String(l._id) === String(loan_id));
  if (idx < 0) throw new InvalidPropertyError(`invalid: loan not found with id ${loan_id}`);

  const merged: any = { ...loans[idx] };
  let touched = false;
  for (const key of LOAN_EDITABLE_FIELDS) {
    if (patch[key] !== undefined) {
      merged[key] = patch[key];
      touched = true;
    }
  }
  if (!touched)
    throw new InvalidPropertyError(
      `invalid: update_loan patch has no editable fields (title, principal_amount, interest_rate, start_month, end_month, deposit_to_bank, type, ref_id, prepayments) — ${PATCH_SCHEMA_HINT}`
    );

  // Same domain entity the web app uses — full validation (including the
  // prepayments shape), then the rebuilt loan replaces the original.
  loans[idx] = MakeLoanAccount(merged);
}

function ApplyAddFdp(plan: any, patch: any): void {
  const fdp = patch.fdp;
  if (!fdp || typeof fdp !== "object")
    throw new InvalidPropertyError("invalid: fdp should be an object");

  const { name, amount, interest_rate, start_month, end_month, tenure, account_id, active } = fdp;
  const start = start_month ?? 1;
  if (typeof start !== "number" || !Number.isFinite(start) || start < 1)
    throw new InvalidPropertyError("invalid: fdp start_month should be a positive number");
  let end = end_month;
  if (end === undefined) {
    if (typeof tenure !== "number" || !Number.isFinite(tenure) || tenure <= 0)
      throw new InvalidPropertyError(
        "invalid: fdp needs end_month or a positive tenure (start_month + tenure - 1)"
      );
    end = start + tenure - 1;
  }
  if (end < start)
    throw new InvalidPropertyError("invalid: fdp end_month should be >= start_month");

  // Strategy-style patches may set the s/e/i split directly; FD-style patches
  // (amount/interest_rate) keep the legacy all-investment default. The entity
  // validates that s + e + i sum to exactly 100.
  const entry = MakeFundDistributionPercentage({
    start_month: start,
    end_month: end,
    s: fdp.s ?? 0,
    e: fdp.e ?? 0,
    i: fdp.i ?? 100,
    name: name || "Fixed Deposit",
    amount,
    interest_rate,
    account_id,
    active: active ?? true,
  });
  for (const key of Object.keys(entry)) {
    if (entry[key] === undefined) delete entry[key];
  }

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

const ASSET_EDITABLE = [
  "title",
  "asset_class",
  "category",
  "principal",
  "purchase_month",
  "growth_rate",
  "volatility",
  "yield_rate",
  "income_frequency",
  "income_mode",
  "compounding",
  "maturity_month",
  "sip",
  "funding_account_id",
  "rent",
  "loan_id",
  "jurisdiction",
  "listed",
  "purchase_date",
  "sale_month",
  "active",
] as const;

function ApplyAddAsset(plan: any, patch: any): void {
  const asset = patch.asset;
  if (!asset || typeof asset !== "object")
    throw new InvalidPropertyError(
      `invalid: add_asset patches need an "asset" object (title, asset_class, category, principal, purchase_month, growth_rate) — ${PATCH_SCHEMA_HINT}`
    );
  const entry = MakeAsset({ ...asset, _id: asset._id || GenerateRandomString(6), active: asset.active ?? true });
  for (const key of Object.keys(entry)) {
    if (entry[key] === undefined) delete entry[key];
  }
  plan.asset_list = plan.asset_list || [];
  plan.asset_list.push(entry);
}

function ApplyUpdateAsset(plan: any, patch: any): void {
  const { asset_id } = patch;
  if (typeof asset_id !== "string" || asset_id.length === 0)
    throw new InvalidPropertyError(`invalid: update_asset patches need an "asset_id" field — ${PATCH_SCHEMA_HINT}`);

  const assets = plan.asset_list || [];
  const idx = assets.findIndex((a: any) => String(a._id) === String(asset_id));
  if (idx < 0) throw new InvalidPropertyError(`invalid: asset not found with id ${asset_id}`);

  const merged: any = { ...assets[idx] };
  let touched = false;
  for (const key of ASSET_EDITABLE) {
    if (patch[key] !== undefined) {
      merged[key] = patch[key];
      touched = true;
    }
  }
  if (!touched)
    throw new InvalidPropertyError(
      `invalid: update_asset patch has no editable fields (title, asset_class, category, principal, purchase_month, growth_rate, yield_rate, maturity_month, sip, rent, sale_month, ...) — ${PATCH_SCHEMA_HINT}`
    );
  assets[idx] = MakeAsset(merged);
}

function ApplySellAsset(plan: any, patch: any): void {
  const { asset_id, month } = patch;
  if (typeof asset_id !== "string" || asset_id.length === 0)
    throw new InvalidPropertyError(`invalid: sell_asset patches need an "asset_id" field — ${PATCH_SCHEMA_HINT}`);
  if (typeof month !== "number" || !Number.isFinite(month) || month < 1)
    throw new InvalidPropertyError("invalid: sell_asset month should be a positive month number");

  const assets = plan.asset_list || [];
  const idx = assets.findIndex((a: any) => String(a._id) === String(asset_id));
  if (idx < 0) throw new InvalidPropertyError(`invalid: asset not found with id ${asset_id}`);
  assets[idx] = { ...assets[idx], sale_month: month };
}

function ApplySetSalary(plan: any, patch: any): void {
  const { amount } = patch;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0)
    throw new InvalidPropertyError("invalid: set_salary amount should be a non-negative number");

  const income_lines = (plan.cashflow_list || []).filter((c: any) => c.category === "i");
  const target = income_lines.find((c: any) => c.primary === true) || income_lines[0];
  if (!target) throw new InvalidPropertyError("invalid: no income line to set — add one with add_income first");
  const idx = (plan.cashflow_list || []).indexOf(target);
  plan.cashflow_list[idx] = { ...target, amount };
}

function ApplyUpdateTaxSettings(plan: any, patch: any): void {
  const current = plan.tax_settings || {};
  plan.tax_settings = {
    regime: patch.regime ?? current.regime ?? "new",
    income_tax_enabled: patch.income_tax_enabled ?? current.income_tax_enabled ?? false,
    age_group: patch.age_group ?? current.age_group ?? "below60",
    ...(patch.deductions !== undefined
      ? { deductions: { ...(current.deductions || {}), ...patch.deductions } }
      : current.deductions !== undefined
        ? { deductions: current.deductions }
        : {}),
    ...(patch.salary_structure !== undefined
      ? { salary_structure: patch.salary_structure }
      : current.salary_structure !== undefined
        ? { salary_structure: current.salary_structure }
        : {}),
  };
}

const PATCH_APPLICATORS: Record<string, PatchApplicator> = {
  add_income: (plan, patch) => ApplyAddCashflow(plan, patch, "i"),
  add_expense: (plan, patch) => ApplyAddCashflow(plan, patch, "e"),
  add_cashflow_change: ApplyAddCashflowChange,
  add_loan: ApplyAddLoan,
  update_loan: ApplyUpdateLoan,
  add_fdp: ApplyAddFdp,
  set_account_balance: ApplySetAccountBalance,
  add_asset: ApplyAddAsset,
  update_asset: ApplyUpdateAsset,
  sell_asset: ApplySellAsset,
  set_salary: ApplySetSalary,
  update_tax_settings: ApplyUpdateTaxSettings,
};

/**
 * Apply an ordered list of scenario patches to a deep copy of the plan.
 * The input plan is never mutated; every patch is validated against the same
 * domain entities the web app uses, so invalid fields throw InvalidPropertyError.
 * Error messages carry the expected patch shape so agents self-correct.
 */
export const PATCH_SCHEMA_HINT =
  'scenario patches look like: [{"op":"add_cashflow_change","change":{"cashflow_id":"<line _id>","change_category":"i|e","change_type":"p|f","value":10,"start_month":24}}, {"op":"add_income","cashflow":{"desc":"...","amount":30000,"start_month":12}}, {"op":"add_loan","loan":{"amount":400000,"interest_rate":9,"tenure":60,"start_month":24,"deposit_to_bank":false}}, {"op":"add_fdp","fdp":{"start_month":12,"end_month":36,"s":20,"e":30,"i":50}}, {"op":"update_loan","loan_id":"<loan _id>","prepayments":[{"start_month":40,"amount":25000,"frequency":"m","step_pct":10,"step_frequency":"y"}]}, {"op":"add_asset","asset":{"title":"HDFC FD","asset_class":"fd","category":"i","principal":100000,"purchase_month":1,"growth_rate":0,"yield_rate":6.75,"income_frequency":"q","income_mode":"reinvest","maturity_month":36}}, {"op":"sell_asset","asset_id":"<asset _id>","month":40}, {"op":"set_salary","amount":250000}, {"op":"update_tax_settings","regime":"new","income_tax_enabled":true}, {"op":"set_account_balance","account_id":"<account _id>","month":12,"balance":500000}] — flat fields are also accepted (op inferred, fields auto-wrapped)';

/** Infer the op and wrap flat fields into the nested shapes the applicators expect. */
function normalizePatch(patch: any, index: number): any {
  if (!patch || typeof patch !== "object")
    throw new InvalidPropertyError(`invalid: patch at index ${index} should be an object — ${PATCH_SCHEMA_HINT}`);
  const has = (k: string) => patch[k] !== undefined;

  let op = patch.op;
  if (!op) {
    if (has("change")) op = "add_cashflow_change";
    else if (has("cashflow")) op = patch.category === "i" ? "add_income" : "add_expense";
    else if (has("fdp")) op = "add_fdp";
    else if (has("asset")) op = "add_asset";
    else if (has("account_id") && has("month") && has("balance")) op = "set_account_balance";
    else if (has("cashflow_id") && has("value") && has("start_month")) op = "add_cashflow_change";
    else if (has("desc") && has("amount") && has("start_month"))
      op = patch.category === "i" ? "add_income" : "add_expense";
    // update_loan BEFORE add_loan: loan_id is unambiguous — an update patch
    // like {loan_id, principal_amount, end_month} would otherwise match add_loan.
    else if (has("loan_id")) op = "update_loan";
    else if (has("asset_id")) op = "update_asset";
    else if (has("asset_class") && has("principal")) op = "add_asset";
    else if (
      (has("amount") || has("principal_amount")) &&
      has("interest_rate") &&
      (has("tenure") || has("end_month"))
    )
      op = "add_loan";
  }
  if (!op || !PATCH_APPLICATORS[op])
    throw new InvalidPropertyError(
      `invalid: unknown scenario op '${String(op)}' at index ${index} — ${PATCH_SCHEMA_HINT}`
    );

  const out: any = { ...patch, op };
  if (op === "add_cashflow_change" && !patch.change) {
    out.change = {};
    for (const k of ["cashflow_id", "category", "change_category", "change_type", "value", "start_month", "end_month", "frequency", "change_desc", "title", "desc"]) {
      if (patch[k] !== undefined) out.change[k] = patch[k];
    }
  }
  if ((op === "add_income" || op === "add_expense") && !patch.cashflow) {
    out.cashflow = {};
    for (const k of ["desc", "amount", "start_month", "end_month", "frequency", "type", "category"]) {
      if (patch[k] !== undefined) out.cashflow[k] = patch[k];
    }
  }
  if (op === "add_loan" && !patch.loan) {
    out.loan = {};
    for (const k of ["amount", "principal_amount", "interest_rate", "tenure", "start_month", "end_month", "title", "loan_name", "deposit_to_bank", "type", "parent_id", "prepayments"]) {
      if (patch[k] !== undefined) out.loan[k] = patch[k];
    }
  }
  if (op === "add_fdp" && !patch.fdp) {
    out.fdp = {};
    // Both vocabularies: the legacy FD shape (name/amount/interest_rate/tenure/account_id)
    // and the strategy shape (start_month/end_month/s/e/i/active).
    for (const k of ["name", "amount", "interest_rate", "tenure", "start_month", "end_month", "account_id", "s", "e", "i", "active"]) {
      if (patch[k] !== undefined) out.fdp[k] = patch[k];
    }
  }
  if (op === "add_asset" && !patch.asset) {
    out.asset = {};
    for (const k of ["title", "asset_class", "category", "principal", "purchase_month", "growth_rate", "volatility", "yield_rate", "income_frequency", "income_mode", "compounding", "maturity_month", "sip", "funding_account_id", "rent", "loan_id", "jurisdiction", "listed", "purchase_date", "active"]) {
      if (patch[k] !== undefined) out.asset[k] = patch[k];
    }
  }
  return out;
}

export function ApplyScenarioToPlan(plan: any, patches: any[]): any {
  if (!plan || typeof plan !== "object")
    throw new InvalidPropertyError("invalid: plan should be an object");
  if (!Array.isArray(patches))
    throw new InvalidPropertyError(`invalid: patches should be an array — ${PATCH_SCHEMA_HINT}`);

  const scenario = DeepCopy(plan);

  patches.forEach((patch, index) => {
    const normalized = normalizePatch(patch, index);
    const apply = PATCH_APPLICATORS[normalized.op];
    apply(scenario, normalized);
  });

  return scenario;
}
