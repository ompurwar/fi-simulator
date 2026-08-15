/** Domain entities, ported from src/entities/* in findependence-core. */

import {
  ACCOUNT_CONSTANTS,
  CASHFLOW_CHANGE_CONSTANTS,
  CASHFLOW_CONSTANTS,
  LOAN_CONSTANTS,
  PLAN_TEMPLATE_CONSTANTS,
  SHARE_OBJECT_CONSTANTS,
} from "./constants";
import { InvalidPropertyError } from "./errors";

/** Generate a random hex string of the given length (used for _id and secrets). */
export function GenerateRandomString(length = 6): string {
  let result = "";
  const chars = "0123456789abcdef";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/* ------------------------------ CashFlow ------------------------------ */

export interface CashFlow {
  _id: string;
  user_id: string;
  plan_id: string;
  category: "i" | "e";
  type: "o" | "p";
  frequency: "m" | "y" | "q" | "h" | null;
  amount: number;
  desc: string;
  start_month: number;
  end_month: number;
  active: boolean;
  primary: boolean;
  status?: "active" | "deleted";
  timestamp?: number;
}

export function MakeCashFlow(input: Record<string, any>): CashFlow {
  const {
    _id = GenerateRandomString(6),
    category,
    type,
    frequency,
    active,
    primary,
    amount,
    desc,
    start_month,
    end_month,
    ...other_info
  } = input;

  const { ONETIME, PERIODIC } = CASHFLOW_CONSTANTS.TYPE;

  if (!Object.values(CASHFLOW_CONSTANTS.TYPE).includes(type))
    throw new InvalidPropertyError("invalid: cash_flow type");

  if (typeof desc !== "string")
    throw new InvalidPropertyError("invalid: desc should be a string.");
  if (desc.length < 3 || desc.length > 100)
    throw new InvalidPropertyError(
      "invalid: description length should be between [4-100] characters"
    );

  if (typeof active !== "boolean")
    throw new InvalidPropertyError("invalid: active should be a boolean.");
  if (typeof primary !== "boolean")
    throw new InvalidPropertyError("invalid: primary should be a boolean.");

  if (!Object.values(CASHFLOW_CONSTANTS.CATEGORY).includes(category))
    throw new InvalidPropertyError("invalid: cash_flow category");

  if (typeof amount !== "number")
    throw new InvalidPropertyError(
      "invalid: amount should be a number not string or anything else"
    );
  if (amount === 0)
    throw new InvalidPropertyError("invalid: amount can't zero ");

  if (typeof start_month !== "number")
    throw new InvalidPropertyError(
      "invalid: start_month should be a number not string or anything else"
    );
  if (typeof end_month !== "number")
    throw new InvalidPropertyError(
      "invalid: end_month should be a number not string or anything else"
    );

  if (type === ONETIME) {
    if (start_month !== end_month)
      throw new InvalidPropertyError(
        "invalid: for onetime income/expense Start Month and End Month should be same"
      );
    if (frequency !== null)
      throw new InvalidPropertyError(
        "invalid: for onetime income/expense frequency should be null"
      );
  } else {
    if (!Object.values(CASHFLOW_CONSTANTS.FREQUENCY).includes(frequency))
      throw new InvalidPropertyError("invalid: cash_flow frequency");
  }

  return {
    _id,
    user_id: other_info.user_id || "",
    plan_id: other_info.plan_id || "",
    type,
    frequency,
    amount,
    desc,
    start_month,
    end_month,
    category,
    active,
    primary,
    ...other_info,
  };
}

export function IsActive(cashflow: CashFlow, current_month: number): boolean {
  return current_month >= cashflow.start_month && current_month <= cashflow.end_month;
}

/* --------------------------- CashFlowChange --------------------------- */

export interface CashFlowChange {
  _id: string;
  user_id?: string;
  cashflow_id: string;
  category: "i" | "e";
  change_type: "f" | "p";
  value: number;
  title: string;
  desc: string;
  start_month: number;
  end_month: number;
  frequency: "m" | "y" | "q" | "h" | "o";
  active: boolean;
  status?: "active" | "deleted";
}

export function MakeCashFlowChange(input: Record<string, any>): CashFlowChange {
  const {
    _id = GenerateRandomString(6),
    category,
    cashflow_id,
    change_type,
    active,
    value,
    title,
    desc,
    start_month,
    end_month,
    frequency,
    ...other_info
  } = input;

  const { FLAT, PERCENTAGE } = CASHFLOW_CHANGE_CONSTANTS.TYPE;

  if (!Object.values(CASHFLOW_CHANGE_CONSTANTS.TYPE).includes(change_type))
    throw new InvalidPropertyError("invalid: cash_flow type");

  if (!Object.values(CASHFLOW_CHANGE_CONSTANTS.CATEGORY).includes(category))
    throw new InvalidPropertyError("invalid: cash_flow category");

  if (typeof title !== "string")
    throw new InvalidPropertyError("invalid: title should be a string.");
  if (title.length < 3 || title.length > 100)
    throw new InvalidPropertyError(
      "invalid: title length should be between [4-100] characters"
    );

  if (typeof desc !== "string")
    throw new InvalidPropertyError("invalid: desc should be a string.");

  if (typeof active !== "boolean")
    throw new InvalidPropertyError("invalid: active should be a boolean.");

  if (typeof value !== "number")
    throw new InvalidPropertyError(
      "invalid: value should be a number not string or anything else"
    );

  if (typeof start_month !== "number")
    throw new InvalidPropertyError(
      "invalid: start_month should be a number not string or anything else"
    );
  if (typeof end_month !== "number")
    throw new InvalidPropertyError(
      "invalid: end_month should be a number not string or anything else"
    );

  if (value === 0)
    throw new InvalidPropertyError("invalid: value can't zero ");

  if (change_type === PERCENTAGE) {
    if (value > 100)
      throw new InvalidPropertyError(
        "invalid: percentage cannot be greater than 100"
      );
  }

  if (!Object.values(CASHFLOW_CHANGE_CONSTANTS.FREQUENCY).includes(frequency))
    throw new InvalidPropertyError("invalid: cash_flow frequency");

  return {
    _id,
    title,
    desc,
    category,
    cashflow_id,
    change_type,
    value,
    start_month,
    end_month,
    frequency,
    active,
    ...other_info,
  };
}

/* ------------------------------ Account ------------------------------ */

export interface Account {
  _id: string;
  title: string;
  init_balance: number;
  category: "s" | "e" | "i";
  type: "a" | "l";
  default_investment_priority?: number;
  parent_id?: string | null;
  roi?: number;
}

export function MakeAccount(input: Record<string, any>): Account {
  const {
    _id = GenerateRandomString(6),
    title,
    init_balance,
    category,
    type,
    default_investment_priority,
    parent_id,
    ...other_info
  } = input;

  if (typeof title !== "string")
    throw new InvalidPropertyError("invalid: title should be a string.");
  if (title.length < 3 || title.length > 100)
    throw new InvalidPropertyError(
      "invalid: title length should be between [4-100] characters"
    );

  if (!Object.values(ACCOUNT_CONSTANTS.TYPE).includes(type))
    throw new InvalidPropertyError("invalid: account type");
  if (!Object.values(ACCOUNT_CONSTANTS.CATEGORY).includes(category))
    throw new InvalidPropertyError("invalid: account category");

  if (typeof init_balance !== "number")
    throw new InvalidPropertyError(
      "invalid: init_balance should be a number not string or anything else"
    );

  if (other_info.roi !== undefined && typeof other_info.roi !== "number")
    throw new InvalidPropertyError(
      "invalid: other_info.roi should be a number not string or anything else"
    );

  if (
    default_investment_priority !== undefined &&
    typeof default_investment_priority !== "number"
  )
    throw new InvalidPropertyError(
      "invalid: default_investment_priority should be a number not string or anything else"
    );

  return {
    _id,
    title,
    init_balance,
    category,
    type,
    default_investment_priority,
    parent_id,
    ...other_info,
  };
}

/* ----------------------------- LoanAccount ----------------------------- */

export interface LoanAccount {
  _id: string;
  title: string;
  principal_amount: number;
  start_month: number;
  end_month: number;
  interest_rate: number;
  ref_id?: string | null;
  type?: number;
  deposit_to_bank?: boolean;
  [key: string]: any;
}

export function MakeLoanAccount(input: Record<string, any>): LoanAccount {
  const {
    _id = GenerateRandomString(6),
    title,
    principal_amount,
    start_month,
    end_month,
    interest_rate,
    ref_id,
    type = 4,
    ...other_info
  } = input;

  if (!Object.values(LOAN_CONSTANTS.TYPE).includes(type))
    throw new InvalidPropertyError("invalid: loan type");

  if (typeof title !== "string")
    throw new InvalidPropertyError("invalid: title should be a string.");
  if (title.length < 3 || title.length > 100)
    throw new InvalidPropertyError(
      "invalid: title length should be between [4-100] characters"
    );

  if (typeof principal_amount !== "number")
    throw new InvalidPropertyError(
      "invalid: principal_amount should be a number not string or anything else"
    );
  if (typeof interest_rate !== "number")
    throw new InvalidPropertyError(
      "invalid: interest_rate should be a number not string or anything else"
    );
  if (typeof start_month !== "number")
    throw new InvalidPropertyError(
      "invalid: start_month should be a number not string or anything else"
    );
  if (typeof end_month !== "number")
    throw new InvalidPropertyError(
      "invalid: end_month should be a number not string or anything else"
    );
  if (start_month > end_month)
    throw new InvalidPropertyError(
      "invalid: start_month should be less than end_month"
    );

  return {
    _id,
    title,
    principal_amount,
    interest_rate,
    start_month,
    end_month,
    ref_id,
    type,
    ...other_info,
  };
}

/* --------------------- FundDistributionPercentage --------------------- */

export interface FundDistributionPercentage {
  _id: string;
  start_month: number;
  end_month: number;
  s: number;
  e: number;
  i: number;
  [key: string]: any;
}

export function MakeFundDistributionPercentage(
  input: Record<string, any>
): FundDistributionPercentage {
  const {
    _id = GenerateRandomString(6),
    start_month,
    end_month,
    s,
    e,
    i,
    ...other_info
  } = input;

  if (typeof start_month !== "number")
    throw new InvalidPropertyError(
      "invalid: start_month should be a number not string or anything else"
    );
  if (typeof end_month !== "number")
    throw new InvalidPropertyError(
      "invalid: end_month should be a number not string or anything else"
    );
  if (typeof s !== "number")
    throw new InvalidPropertyError(
      "invalid: savings should be a number not string or anything else"
    );
  if (typeof e !== "number")
    throw new InvalidPropertyError(
      "invalid: emergency should be a number not string or anything else"
    );
  if (typeof i !== "number")
    throw new InvalidPropertyError(
      "invalid: investment should be a number not string or anything else"
    );

  if (s + i + e !== 100)
    throw new InvalidPropertyError(
      "invalid: sum of savings+investment+emergency should be 100"
    );

  return { _id, start_month, end_month, s, e, i, ...other_info };
}

/* -------------------------------- User -------------------------------- */

export interface UserProfile {
  _id: string;
  first_name?: string;
  last_name?: string;
  email: string;
  credentials?: { salt: string; hash: string };
  default_plan_id?: string;
  photos?: string[];
  src?: "std" | "google";
  ob_params?: Record<string, any>;
  timestamp?: number;
  status?: string;
  IsValidPassword?: (pass: string) => boolean;
}

export function MakeUser(
  input: Record<string, any>,
  GenerateHash: (pass: string, salt: string) => string
): UserProfile {
  const { first_name, last_name, email, ...other_info } = input;

  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new InvalidPropertyError("Email is not valid");

  const normalized: UserProfile = {
    _id: other_info._id || GenerateRandomString(24),
    first_name: first_name?.toLowerCase(),
    last_name: last_name?.toLowerCase(),
    email: email.toLowerCase(),
    ...other_info,
  };
  if (!other_info.default_plan_id) normalized.default_plan_id = "";

  function IsValidPassword(pass: string): boolean {
    let is_valid = false;
    const { salt, hash } = normalized.credentials || {};
    if (salt && hash && GenerateHash(pass, salt) === hash) {
      is_valid = true;
    }
    return is_valid;
  }
  return Object.freeze({ ...normalized, IsValidPassword });
}

/* ------------------------------ Session ------------------------------ */

export interface Session {
  _id?: string;
  user_id: string;
  session_id: string;
  status?: "active" | "deleted";
  timeout: number;
  state: boolean;
  timestamp?: number;
}

export function MakeSession(
  input: Record<string, any>,
  opts: { sessionIdLength: number; sessionTimeoutHours: number }
): Session {
  const {
    user_id,
    session_id = GenerateRandomString(opts.sessionIdLength),
    status,
    timeout = Date.now() + opts.sessionTimeoutHours * 60 * 60 * 1000,
    state = true,
  } = input;

  if (typeof timeout !== "number")
    throw new InvalidPropertyError("timeout should be a epoch in milliseconds");

  if (typeof user_id !== "string" || !/^([a-f0-9]){24}$/.test(user_id))
    throw new InvalidPropertyError("user_id should be a mongo string");

  if (status && !/^(active|deleted)$/.test(status))
    throw new InvalidPropertyError("status should be active | deleted");

  if (typeof session_id === "string") {
    if (
      !/^([a-f]|\d)+$/.test(session_id) &&
      session_id.length < opts.sessionIdLength
    )
      throw new InvalidPropertyError(
        `session_id should an hexadecimal string of length ${opts.sessionIdLength}`
      );
  }
  if (session_id === null)
    throw new InvalidPropertyError(
      `session_id should an hexadecimal string of length ${opts.sessionIdLength}`
    );

  if (typeof state !== "boolean" && state !== undefined && state !== null)
    throw new InvalidPropertyError("state should be of type boolean");

  return Object.freeze({ user_id, session_id, status, timeout, state });
}

/* --------------------------- PlanTemplate --------------------------- */

export interface PlanTemplate {
  _id: string;
  user_id: string;
  cashflow_list: CashFlow[];
  account_list: Account[];
  loan_accounts: LoanAccount[];
  cashflow_change_list: CashFlowChange[];
  fund_distribution_percentage: FundDistributionPercentage[];
  category: "std" | "t-i" | "t-c";
  title: string;
  description: string;
  share_id?: string | null;
  parent_id?: string | null;
  status?: "active" | "deleted";
  timestamp?: number;
  modified_at?: number;
  [key: string]: any;
}

export function MakePlan(input: Record<string, any>): PlanTemplate {
  const {
    user_id,
    cashflow_list,
    account_list,
    loan_accounts,
    cashflow_change_list,
    fund_distribution_percentage,
    category = PLAN_TEMPLATE_CONSTANTS.CATEGORY.STANDARD,
    title = "",
    description = "",
    ...other_info
  } = input;

  if (typeof title !== "string")
    throw new InvalidPropertyError("Plan title should be of type string");
  if (!Object.values(PLAN_TEMPLATE_CONSTANTS.CATEGORY).includes(category))
    throw new InvalidPropertyError("invalid: category");
  if (title.length === 0)
    throw new InvalidPropertyError("Plan title is required.");
  if (title.length > 255)
    throw new InvalidPropertyError(
      "Plan title cant be longer than 255 character."
    );
  if (description.length > 255)
    throw new InvalidPropertyError(
      "Plan description cant me longer than 255 character."
    );

  if (!Array.isArray(account_list))
    throw new InvalidPropertyError("account_list should be an Array");
  if (!Array.isArray(cashflow_list))
    throw new InvalidPropertyError("cashflow_list should be an Array");
  if (!Array.isArray(cashflow_change_list))
    throw new InvalidPropertyError("cashflow_change_list should be an Array");
  if (!Array.isArray(fund_distribution_percentage))
    throw new InvalidPropertyError(
      "fund_distribution_percentage should be an Array"
    );

  cashflow_list.forEach((cashflow, index) => {
    if (typeof cashflow !== "object" || cashflow === null) return;
    try {
      MakeCashFlow(cashflow);
    } catch (e: any) {
      throw new InvalidPropertyError(
        `Invalid cashflow at number ${index + 1} |${e.message}`
      );
    }
  });
  cashflow_change_list.forEach((cashflow_change, index) => {
    if (typeof cashflow_change !== "object" || cashflow_change === null) return;
    try {
      MakeCashFlowChange(cashflow_change);
    } catch (e: any) {
      throw new InvalidPropertyError(
        `Invalid cashflow change  at number ${index + 1} |${e.message}`
      );
    }
  });
  account_list.forEach((account, index) => {
    if (typeof account !== "object" || account === null) return;
    try {
      MakeAccount(account);
    } catch (e: any) {
      throw new InvalidPropertyError(
        `Invalid account at number ${index + 1} |${e.message}`
      );
    }
  });
  loan_accounts.forEach((loan_account: Record<string, any>, index: number) => {
    if (typeof loan_account !== "object" || loan_account === null) return;
    try {
      MakeLoanAccount(loan_account);
    } catch (e: any) {
      throw new InvalidPropertyError(
        `Invalid loan account at number ${index + 1} |${e.message}`
      );
    }
  });
  fund_distribution_percentage.forEach((fund_distribution_obj, index) => {
    if (typeof fund_distribution_obj !== "object" || fund_distribution_obj === null) return;
    try {
      MakeFundDistributionPercentage(fund_distribution_obj);
    } catch (e: any) {
      throw new InvalidPropertyError(
        `Invalid fund_distribution_obj  at number ${index + 1} |${e.message}`
      );
    }
  });

  const normalized: any = {
    user_id,
    cashflow_list,
    account_list,
    loan_accounts,
    cashflow_change_list,
    fund_distribution_percentage,
    title,
    description,
    category,
    ...other_info,
  };
  if (!other_info.share_id) normalized.share_id = null;
  if (!other_info.parent_id) normalized.parent_id = null;

  return normalized;
}

/* ---------------------------- ShareObject ---------------------------- */

export interface ShareObject {
  _id: string;
  type: "template" | "blog-link";
  category: "t-i" | "t-c";
  state: "public" | "private";
  title: string;
  description: string;
  promotional_links: any[];
  creator_name: string;
  creator_id: string;
  img_url: string;
  onboard_count: number;
  plan_ids: string[];
  status?: "active" | "deleted" | "dormant";
  timestamp?: number;
  modified_at?: number;
  [key: string]: any;
}

export function MakeShareObject(input: Record<string, any>): ShareObject {
  const {
    type,
    category,
    state = SHARE_OBJECT_CONSTANTS.STATE.PRIVATE,
    title,
    description = "",
    promotional_links,
    creator_name,
    creator_id,
    img_url = "",
    onboard_count,
    plan_ids,
    ...other_info
  } = input;

  if (!Object.values(SHARE_OBJECT_CONSTANTS.CATEGORY).includes(category))
    throw new InvalidPropertyError("invalid: category");
  if (!Object.values(SHARE_OBJECT_CONSTANTS.TYPE).includes(type))
    throw new InvalidPropertyError("invalid: type");
  if (!Object.values(SHARE_OBJECT_CONSTANTS.STATE).includes(state))
    throw new InvalidPropertyError("invalid: state");

  if (typeof title !== "string")
    throw new InvalidPropertyError("Plan title should be of type string");
  if (title.length === 0)
    throw new InvalidPropertyError("Plan title is required.");
  if (title.length > 500)
    throw new InvalidPropertyError(
      "Plan title cant be longer than 500 character."
    );
  if (typeof description !== "string")
    throw new InvalidPropertyError("Plan description should be of type string");
  if (description.length > 500)
    throw new InvalidPropertyError(
      "Plan description cant me longer than 500 character."
    );
  if (typeof creator_name !== "string")
    throw new InvalidPropertyError("Plan creator_name should be of type string");
  if (!Array.isArray(promotional_links))
    throw new InvalidPropertyError("promotional_links should be an array");
  if (!Array.isArray(plan_ids))
    throw new InvalidPropertyError("plan_ids should be an array");
  if (typeof onboard_count !== "number")
    throw new InvalidPropertyError("Plan onboard_count should be a number");
  if (typeof img_url !== "string")
    throw new InvalidPropertyError("Plan img_url should be of type string");

  const normalized: any = {
    type,
    category,
    state,
    title,
    description,
    promotional_links,
    creator_name,
    creator_id,
    img_url,
    onboard_count,
    plan_ids,
    ...other_info,
  };
  if (other_info.creator_name)
    other_info.creator_name = other_info.creator_name.toLowerCase();
  if (other_info.description)
    other_info.description = other_info.description.split(" ").filter((_: any) => _).join(" ");

  return normalized;
}

/* ------------------------ PasswordResetSession ------------------------ */

export interface PasswordResetSession {
  _id?: string;
  user_id: string;
  secret: string;
  expires_at: number;
  used: boolean;
  status?: "active" | "deleted";
  timestamp?: number;
}

export function MakePasswordResetSession(
  input: Record<string, any>,
  pwResetSessionLengthMin: number
): PasswordResetSession {
  const {
    user_id,
    secret = GenerateRandomString(16),
    expires_at = Date.now() + pwResetSessionLengthMin * 60 * 1000,
    used = false,
    ...other_info
  } = input;

  if (typeof used !== "boolean")
    throw new InvalidPropertyError("Plan used should be of type boolean");

  return Object.freeze({ user_id, secret, expires_at, used, ...other_info });
}

/* ------------------------------ ApiToken ------------------------------ */

export interface ApiToken {
  _id: string;
  user_id: string;
  name: string;
  token_hash: string;
  status: "active" | "deleted";
  created_at: number;
  last_used_at?: number;
}

export function MakeApiToken(input: Record<string, any>): ApiToken {
  const {
    _id = GenerateRandomString(24),
    user_id,
    name,
    token_hash,
    status = "active",
    created_at = Date.now(),
    ...other_info
  } = input;

  if (typeof user_id !== "string" || user_id.length === 0)
    throw new InvalidPropertyError("invalid: user_id is required");
  if (typeof name !== "string" || name.length === 0)
    throw new InvalidPropertyError("invalid: name is required");
  if (typeof token_hash !== "string" || token_hash.length === 0)
    throw new InvalidPropertyError("invalid: token_hash is required");
  if (status && !/^(active|deleted)$/.test(status))
    throw new InvalidPropertyError("status should be active | deleted");

  return Object.freeze({
    _id,
    user_id,
    name,
    token_hash,
    status,
    created_at,
    ...other_info,
  });
}
