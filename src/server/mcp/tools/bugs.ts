import type { Container } from "../../di/container";
import { z } from "zod";
import type { ToolDefinition } from "../types";

/**
 * Engine bug reports — the structured channel agents/users use to report
 * discrepancies and contradictions they found in the planning engine
 * (snapshot numbers, funding/skip behavior, MCP tool output, ...).
 * Reports land in Bug_Report_Store with a full reproduction contract and a
 * resolved flag; reporters (or admins) resolve/reopen them.
 */
export function makeBugReportTools(container: Container): ToolDefinition[] {
  const { app } = container;

  return [
    {
      name: "report_engine_bug",
      title: "Report an engine bug",
      description:
        "Submit a structured bug report about the planning engine to Bug_Report_Store. Use it ONLY when you can point at a concrete discrepancy: expected vs actual numbers both taken from tool results (e.g. two tool calls that contradict each other, a balance that cannot be reconstructed, a skip that should not have happened). Include the steps that reproduce it (month numbers, tool calls, amounts). NEVER report without concrete values — vague observations are noise. Duplicate open reports are detected automatically and the existing id is returned.",
      inputSchema: {
        title: z.string().min(3).max(100),
        description: z.string().min(10).max(2000),
        category: z.enum(["engine", "snapshot", "mcp", "ui", "other"]).optional(),
        severity: z.enum(["low", "medium", "high", "critical"]).optional(),
        steps_to_reproduce: z.string().min(10).max(2000),
        expected_behavior: z.string().min(1).max(1000),
        actual_behavior: z.string().min(1).max(1000),
        plan_id: z.string().optional(),
        session_id: z.string().optional(),
      },
      async handler(ctx, args) {
        const result = await app.SubmitEngineBug({ user_id: ctx.user_id, ...args });
        return { ok: true, data: result };
      },
    },
    {
      name: "list_engine_bugs",
      title: "List bug reports",
      description:
        "List engine bug reports (newest first). Admins see every report; regular users see only theirs. Optional filters: status (open|resolved|duplicate) and severity (low|medium|high|critical).",
      inputSchema: {
        status: z.enum(["open", "resolved", "duplicate"]).optional(),
        severity: z.enum(["low", "medium", "high", "critical"]).optional(),
      },
      async handler(ctx, args) {
        const data = await app.ListEngineBugs({ ...ctx, ...args });
        return { ok: true, data };
      },
    },
    {
      name: "get_engine_bug",
      title: "Get a bug report",
      description:
        "Fetch one bug report with its full reproduction contract (steps, expected vs actual, plan_id when provided) — useful when fixing the engine from a report.",
      inputSchema: {
        bug_id: z.string(),
      },
      async handler(ctx, args) {
        const data = await app.GetEngineBug({ ...ctx, bug_id: args.bug_id });
        return { ok: true, data };
      },
    },
    {
      name: "resolve_engine_bug",
      title: "Resolve / reopen a bug report",
      description:
        "Mark a bug report resolved (with an optional resolution note) or reopen it. The reporter of the bug or an admin may do this; other users get FORBIDDEN.",
      inputSchema: {
        bug_id: z.string(),
        resolution_note: z.string().max(1000).optional(),
        reopen: z.boolean().optional(),
      },
      async handler(ctx, args) {
        const result = await app.ResolveEngineBug({ ...ctx, ...args });
        return { ok: true, data: result };
      },
    },
  ];
}
