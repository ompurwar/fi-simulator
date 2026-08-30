import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, signupUser, type TestApp } from "../helpers";
import { makeToolRegistry, callRegistryTool } from "@/server/mcp/registry";
import type { ToolContext } from "@/server/mcp/types";

let t: TestApp;
let ctx: ToolContext;
let other_ctx: ToolContext;
let admin_ctx: ToolContext;

beforeAll(async () => {
  t = await createTestApp();
  const a = await signupUser(t.app);
  const b = await signupUser(t.app);
  const sa = await t.container.session_list.FindByActiveSessionId(a.session_id);
  const sb = await t.container.session_list.FindByActiveSessionId(b.session_id);
  if (!sa || !sb) throw new Error("no sessions");
  ctx = { user_id: sa.user_id.toString(), role: "user" };
  other_ctx = { user_id: sb.user_id.toString(), role: "user" };
  admin_ctx = { ...ctx, role: "admin" };
});

afterAll(async () => {
  await t.stop();
});

const BUG = {
  title: "Balance mismatch at month 70",
  description:
    "plan_snapshot and simulate_plan disagree on the savings balance at month 70 after the down payment (1864930 vs 1327800).",
  category: "engine",
  severity: "high",
  steps_to_reproduce:
    "Create a plan with a 22L one-time expense at month 70 and SIPs drawing from savings; call plan_snapshot then simulate_plan and compare balances_by_month[69].",
  expected_behavior: "Both tools return the same savings balance after the SIP debits settle.",
  actual_behavior: "plan_snapshot shows 18,64,930 but simulate_plan shows 13,27,800.",
};

describe("engine bug reports", () => {
  it("submits a report and marks it open", async () => {
    const res = await callRegistryTool(makeToolRegistry(t.container), ctx, "report_engine_bug", BUG);
    expect(res.ok).toBe(true);
    expect((res as any).data).toMatchObject({ status: "open" });
    expect((res as any).data.bug_id).toBeTruthy();
  });

  it("deduplicates the same open report and returns the existing id", async () => {
    const res = await callRegistryTool(makeToolRegistry(t.container), ctx, "report_engine_bug", BUG);
    expect(res.ok).toBe(true);
    expect((res as any).data.status).toBe("duplicate");
    expect((res as any).data.duplicate_of).toBe((res as any).data.bug_id);
    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_engine_bugs", {});
    expect((list as any).data).toHaveLength(1);
  });

  it("keeps visibility per user; submitters may resolve; admins may resolve anything", async () => {
    const other_bug = await callRegistryTool(makeToolRegistry(t.container), other_ctx, "report_engine_bug", {
      ...BUG,
      title: "Wrong EMI schedule months",
      description:
        "The EMI schedule rows start at start_month-1 for deposit_to_bank loans, shifting every payment one month earlier than the loan's own start_month.",
    });
    expect(other_bug.ok).toBe(true);
    const other_id = (other_bug as any).data.bug_id;

    // A's list hides B's report
    const mine = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_engine_bugs", {});
    expect((mine as any).data).toHaveLength(1);
    // B cannot read A's report
    const read_foreign = await callRegistryTool(makeToolRegistry(t.container), other_ctx, "get_engine_bug", {
      bug_id: (mine as any).data[0]._id,
    });
    expect(read_foreign.ok).toBe(false);
    // B resolves own report
    const resolve_own = await callRegistryTool(makeToolRegistry(t.container), other_ctx, "resolve_engine_bug", {
      bug_id: other_id,
      resolution_note: "EMI seq was correct after the funding fix (tested on the real plan).",
    });
    expect(resolve_own.ok).toBe(true);
    expect((resolve_own as any).data.status).toBe("resolved");
    // a resolved bug can be reported again (new open row)
    const again = await callRegistryTool(makeToolRegistry(t.container), other_ctx, "report_engine_bug", {
      ...BUG,
      title: "Wrong EMI schedule months",
      description:
        "The EMI schedule rows start at start_month-1 for deposit_to_bank loans, shifting every payment one month earlier than the loan's own start_month.",
    });
    expect((again as any).data.status).toBe("open");
    // unrelated user cannot resolve A's bug
    const my_bug = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_engine_bugs", {});
    const can_resolve_as_other = await callRegistryTool(makeToolRegistry(t.container), other_ctx, "resolve_engine_bug", {
      bug_id: (my_bug as any).data[0]._id,
    });
    expect(can_resolve_as_other.ok).toBe(false);
    // admin resolves A's bug
    const admin_resolve = await callRegistryTool(makeToolRegistry(t.container), admin_ctx, "resolve_engine_bug", {
      bug_id: (my_bug as any).data[0]._id,
      resolution_note: "Fixed by the pool-injection fixed-point.",
    });
    expect(admin_resolve.ok).toBe(true);
    // admin sees everything
    const all = await callRegistryTool(makeToolRegistry(t.container), admin_ctx, "list_engine_bugs", {});
    expect((all as any).data.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects invalid inputs", async () => {
    const bad = await callRegistryTool(makeToolRegistry(t.container), ctx, "report_engine_bug", {
      ...BUG,
      severity: "urgent",
    });
    expect(bad.ok).toBe(false);
    const short = await callRegistryTool(makeToolRegistry(t.container), ctx, "report_engine_bug", {
      ...BUG,
      title: "x",
    });
    expect(short.ok).toBe(false);
  });
});
