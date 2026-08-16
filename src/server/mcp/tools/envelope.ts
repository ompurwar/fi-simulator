/** Shared error-envelope helpers for MCP tool handlers. */

import {
  InvalidOperationError,
  InvalidPropertyError,
  RequiredParameterError,
  UserNotFoundByEmailError,
} from "../../domain/errors";
import type { ToolResult } from "../types";

export function ok(data: unknown): ToolResult {
  return { ok: true, data };
}

export function fail(code: string, message: string, details?: unknown): ToolResult {
  return { ok: false, error: { code, message, details } };
}

const NOT_FOUND_MESSAGE = /not found|invalid (plan|plane)|invalid plan selected/i;

/** Run a use-case call and convert thrown domain errors into a ToolResult envelope. */
export async function callUseCase<T>(fn: () => Promise<T> | T): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (err: any) {
    const message = err?.message || String(err);
    if (err instanceof InvalidPropertyError || err instanceof RequiredParameterError)
      return fail("VALIDATION_FAILED", message);
    if (
      err instanceof UserNotFoundByEmailError ||
      (err instanceof InvalidOperationError && NOT_FOUND_MESSAGE.test(message))
    )
      return fail("NOT_FOUND", message);
    return fail("INTERNAL", message);
  }
}

/** Validate that every listed arg is present; returns an error envelope or null. */
export function requireFields(
  args: Record<string, any>,
  fields: string[]
): ToolResult | null {
  for (const field of fields) {
    const value = args[field];
    if (value === undefined || value === null || value === "") {
      return fail("VALIDATION_FAILED", `missing required argument: ${field}`);
    }
  }
  return null;
}

export function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringId(value: any): any {
  return typeof value?.toString === "function" ? value.toString() : value;
}

/** Convert Mongo ObjectId fields to plain strings for JSON-safe tool output. */
export function planToPlain(plan: any): any {
  if (!plan) return plan;
  return { ...plan, _id: toStringId(plan._id), user_id: toStringId(plan.user_id) };
}

export function userToPlain(user: any): any {
  if (!user) return user;
  return { ...user, _id: toStringId(user._id) };
}
