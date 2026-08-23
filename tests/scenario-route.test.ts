import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { buildContainer } from "@/server/di/container";
import { buildApp } from "@/server/http/app";
import { NextRequest } from "next/server";
import { signupUser } from "./helpers";
import { makeToolRegistry, callRegistryTool } from "@/server/mcp/registry";

// The route builds its own container from process.env — set env BEFORE importing it.
const mongo = await MongoMemoryServer.create();
process.env.DB_URL = mongo.getUri();
process.env.DB_NAME = "fi_plan_test_scenario";
process.env.COOKIE_SECRET = "test-cookie-secret";

const { POST } = await import("../app/api/engine/scenario/route");

let container: Awaited<ReturnType<typeof buildContainer>>;
let session_id: string;
let user_id: string;
let plan_id: string;

async function scenario(body: unknown, headers: Record<string, string> = {}) {
  const res = await POST(
    new NextRequest("http://localhost:3001/api/engine/scenario", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, json: await res.json().catch(() => null) };
}

function netWorthAt(snapshot: any, month: number): number {
  const buckets = (snapshot.account_balances_and_transactions?.account_balances || [])
    .filter((b: any) => b.month === month)
    .reduce((s: number, b: any) => s + (b.balance || 0), 0);
  const assets = (snapshot.asset_month_map?.[month] || []).reduce((s: number, a: any) => s + (a.value || 0), 0);
  return buckets + assets;
}

beforeAll(async () => {
  container = await buildContainer();
  const app = buildApp(container);
  const signed = await signupUser(app);
  session_id = signed.session_id;
  const session = await container.session_list.FindByActiveSessionId(session_id);
  user_id = session!.user_id.toString();
  const ctx = { user_id, role: "user" };
  const created = await callRegistryTool(makeToolRegistry(container), ctx, "create_plan", {
    title: "Scenario test plan",
    monthly_income: 300000,
    monthly_expense: 60000,
  });
  plan_id = (created as any).data.plan_id || (created as any).data._id;
});

afterAll(async () => {
  await mongo.stop();
});

describe("POST /api/engine/scenario", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await scenario({ plan_id, patches: [{ op: "set_salary", amount: 250000 }] });
    expect(res.status).toBe(401);
  });

  it("returns 400 when patches are missing", async () => {
    const res = await scenario({ plan_id }, { "auth-token": session_id });
    expect(res.status).toBe(400);
  });

  it("caps the patch count to prevent CPU abuse", async () => {
    const patches = Array.from({ length: 60 }, () => ({ op: "set_salary", amount: 100000 }));
    const res = await scenario({ plan_id, patches }, { "auth-token": session_id });
    expect(res.status).toBe(400);
    expect(res.json.error.message).toContain("too many patches");
  });

  it("rejects plans the user does not own with 403", async () => {
    const other = await signupUser(buildApp(container));
    const otherSession = await container.session_list.FindByActiveSessionId(other.session_id);
    const other_ctx = { user_id: otherSession!.user_id.toString(), role: "user" };
    const created = await callRegistryTool(makeToolRegistry(container), other_ctx, "create_plan", {
      title: "Other plan",
      monthly_income: 100000,
    });
    const other_plan_id = (created as any).data.plan_id || (created as any).data._id;
    const res = await scenario({ plan_id: other_plan_id, patches: [{ op: "set_salary", amount: 1 }] }, { "auth-token": session_id });
    expect(res.status).toBe(403);
  });

  it("applies patches to a COPY — the plan document is never mutated", async () => {
    const before = await container.plan_list.FindById(plan_id);
    const res = await scenario(
      {
        plan_id,
        patches: [
          { op: "set_salary", amount: 250000 },
          { op: "update_tax_settings", income_tax_enabled: true, regime: "new" },
        ],
      },
      { "auth-token": session_id }
    );
    expect(res.status).toBe(200);
    const data = res.json.data;
    // patched salary visible in the returned snapshot
    expect(data.snapshot.cashflow.income_statement[0].total_income).toBe(250000);
    // auto tax expense present
    expect((data.snapshot.tax_expense_cashflow || []).length).toBeGreaterThan(0);
    // persisted plan untouched
    const after = await container.plan_list.FindById(plan_id);
    expect(after!.cashflow_list!.find((c: any) => c.category === "i")!.amount).toBe(
      before!.cashflow_list!.find((c: any) => c.category === "i")!.amount
    );
  });

  it("MCP simulate_plan and the UI route return IDENTICAL numbers (parity guard)", async () => {
    const ctx = { user_id, role: "user" };
    const registry = makeToolRegistry(container);
    // seed an asset + tax on the plan so the snapshot has holdings and tax rows
    await callRegistryTool(registry, ctx, "add_asset", {
      plan_id,
      title: "Gold",
      asset_class: "gold",
      category: "i",
      principal: 200000,
      purchase_month: 1,
      growth_rate: 8.5,
    });
    await callRegistryTool(registry, ctx, "update_tax_settings", {
      plan_id,
      income_tax_enabled: true,
      regime: "new",
    });

    const patches = [{ op: "set_salary", amount: 250000 }];

    const mcp = await callRegistryTool(registry, ctx, "simulate_plan", {
      plan_id,
      duration: 12,
      patches,
    });
    expect(mcp.ok).toBe(true);
    const mcp_snap = (mcp as any).data.snapshot;

    const route = await scenario({ plan_id, patches, duration: 12 }, { "auth-token": session_id });
    expect(route.status).toBe(200);
    const route_snap = route.json.data.snapshot;

    expect(netWorthAt(route_snap, 1)).toBeCloseTo(netWorthAt(mcp_snap, 1), 0);
    const tax_route = (route_snap.tax_expense_cashflow || []).reduce((s: number, r: any) => s + r.amount, 0);
    const tax_mcp = (mcp_snap.tax_expense_cashflow || []).reduce((s: number, r: any) => s + r.amount, 0);
    expect(tax_route).toBeCloseTo(tax_mcp, 0);
    expect(route.json.data.applied_patches.map((p: any) => p.op)).toEqual(["set_salary"]);

    // cleanup for other tests in the suite
    await callRegistryTool(registry, ctx, "update_tax_settings", { plan_id, income_tax_enabled: false });
    const list = await callRegistryTool(registry, ctx, "list_assets", { plan_id });
    const gold = (list as any).data.find((a: any) => a.title === "Gold");
    await callRegistryTool(registry, ctx, "delete_asset", { plan_id, asset_id: gold._id });
  });
});
