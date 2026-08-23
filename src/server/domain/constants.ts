import { InvalidPropertyError, RequiredParameterError } from "./errors";

/** Shared domain constants, ported from the entity files. */

export const CASHFLOW_CONSTANTS = {
  FREQUENCY: {
    MONTHLY: "m",
    YEARLY: "y",
    QUARTERLY: "q",
    HALF_YEARLY: "h",
  },
  CATEGORY: {
    INCOME: "i",
    EXPENSE: "e",
  },
  TYPE: {
    ONETIME: "o",
    PERIODIC: "p",
  },
} as const;

export const CASHFLOW_CHANGE_CONSTANTS = {
  TYPE: {
    FLAT: "f",
    PERCENTAGE: "p",
  },
  CATEGORY: {
    INCOME: "i",
    EXPENSE: "e",
  },
  FREQUENCY: {
    MONTHLY: "m",
    YEARLY: "y",
    QUARTERLY: "q",
    HALF_YEARLY: "h",
    ONCE: "o",
  },
} as const;

export const ACCOUNT_CONSTANTS = {
  CATEGORY: {
    SAVING: "s",
    EMERGENCY: "e",
    INVESTMENT: "i",
  },
  TYPE: {
    ASSET: "a",
    LIABILITY: "l",
  },
} as const;

export const ASSET_CLASS_CONSTANTS = {
  CLASS: {
    FD: "fd",
    BOND: "bond",
    SAVINGS: "savings",
    GOLD: "gold",
    PPF: "ppf",
    EQUITY: "equity",
    EQUITY_FOREIGN: "equity_foreign",
    MF: "mf",
    REAL_ESTATE: "real_estate",
    VDA: "vda",
  },
  INCOME_FREQUENCY: {
    MONTHLY: "m",
    QUARTERLY: "q",
    HALF_YEARLY: "h",
    YEARLY: "y",
  },
  COMPOUNDING: {
    NONE: "none",
    SIMPLE: "simple",
    MONTHLY: "monthly",
    QUARTERLY: "quarterly",
    YEARLY: "yearly",
  },
  JURISDICTION: {
    INDIA: "in",
    FOREIGN: "foreign",
  },
} as const;

export const LOAN_CONSTANTS = {
  TYPE: {
    HOME_LOAN: 1,
    CAR_LOAN: 2,
    PERSONAL_LOAN: 3,
    CREDIT_CARD: 4,
    OTHER: 5,
  },
} as const;

export const PLAN_TEMPLATE_CONSTANTS = {
  CATEGORY: {
    INDIVIDUAL: "t-i",
    COMPARISON: "t-c",
    STANDARD: "std",
  },
} as const;

export const SHARE_OBJECT_CONSTANTS = {
  STATE: {
    PUBLIC: "public",
    PRIVATE: "private",
  },
  CATEGORY: {
    INDIVIDUAL: "t-i",
    COMPARISON: "t-c",
  },
  TYPE: {
    TEMPLATE: "template",
    BLOG_LINK: "blog-link",
  },
} as const;

export function RequiredParam(param: string): never {
  throw new RequiredParameterError(`${param} is required`);
}

export function IsValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
