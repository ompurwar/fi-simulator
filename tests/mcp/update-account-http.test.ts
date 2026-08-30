import { describe, it, expect, beforeAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { buildContainer } from "@/server/di/container";
import { NextRequest } from "next/server";

// The route builds its own container from process.env — set env BEFORE importing it.
const mongo = await MongoMemoryServer.create();
process.env.DB_URL = mongo.getUri();
process.env.DB_NAME = "fi_plan_test_mcp_update_account";
process.env.COOKIE_SECRET = "test-cookie-secret";
process.env.MCP_ENABLED = "true";
process.env.CLIENT_APPLICATION = "http://localhost:3001";

const { POST } = await import("../../app/api/mcp/route");

async function rpc(method: string, params: any, token: string, id = 1) {
  const body = { jsonrpc: "2.0", id, method, params };
  const res = await POST(
    new NextRequest("http://localhost:3001/api/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
  );
  const parsed = JSON.parse(await res.text());
  if (parsed.error) throw new Error(`rpc ${method} failed: ${JSON.stringify(parsed.error)}`);
  return JSON.parse(parsed.result?.content?.[0]?.text);
}

async function callTool(token: string, name: string, arguments_: any) {
  return rpc("tools/call", { name, arguments: arguments_ }, token);
}

describe("update_account init_balance=0 over the real MCP HTTP route", () => {
  let container: Awaited<ReturnType<typeof buildContainer>>;
  let user_id: string;
  let token: string;
  let plan_id: string;

  beforeAll(async () => {
    container = await buildContainer();
    const session = await container.app.Signup({
      email: `mcp-ua-${Date.now()}@test.com`,
      password: "secret123",
      first_name: "MCP",
      last_name: "User",
    });
    user_id = session.user_id;
    const created = await container.app.CreateApiToken({ user_id, name: "test-agent" });
    token = created.api_token;
    await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "vitest", version: "1" } }, token, 0).catch(() => {});
  });

  it("persists init_balance=0 (bug 6a946e1350b36af698cf127c repro over HTTP)", async () => {
    const created = await callTool(token, "create_plan", {
      title: "Zero-balance HTTP repro",
      monthly_income: 200000,
      monthly_expense: 60000,
    });
    plan_id = created.data.plan_id || created.data._id;

    const list1 = await callTool(token, "list_accounts", { plan_id });
    const emergency = list1.data.find((a: any) => a.category === "e");
    const savings = list1.data.find((a: any) => a.category === "s");
    expect(emergency).toBeTruthy();
    expect(savings).toBeTruthy();

    // seed a non-zero balance first, mirroring the reported plan state
    const seed = await callTool(token, "update_account", {
      plan_id,
      account_id: emergency._id,
      init_balance: 800000,
    });
    expect(seed.ok).toBe(true);
    // snapshot proof: month-1 "Initial Balance" transaction for 'e' must be 0, not 800000
    const initBalanceTxnOf = (snap: any) => {
      const month1 = snap.data.balance_and_transaction_by_month.find((m: any) => m.month === 1);
      const entry = (month1?.data || []).find((d: any) => (d.balance || []).some((b: any) => b.category === "e"));
      return (entry?.txn || []).find((t: any) => t.tran_desc === "Initial Balance")?.amount;
    };
    const snapSeeded = await callTool(token, "plan_snapshot", { plan_id });
    expect(initBalanceTxnOf(snapSeeded)).toBe(800000);

    // the bug: set it back to zero
    const zero = await callTool(token, "update_account", {
      plan_id,
      account_id: emergency._id,
      init_balance: 0,
    });
    expect(zero.ok).toBe(true);
    expect(zero.data?.updated).toBe(true);

    // non-zero control update, as in the report
    const control = await callTool(token, "update_account", {
      plan_id,
      account_id: savings._id,
      init_balance: 130000,
    });
    expect(control.ok).toBe(true);

    const after = await callTool(token, "list_accounts", { plan_id });
    const updatedEmergency = after.data.find((a: any) => a._id === emergency._id);
    const updatedSavings = after.data.find((a: any) => a._id === savings._id);
    expect(updatedSavings.init_balance).toBe(130000);
    expect(updatedEmergency.init_balance).toBe(0);

    // the snapshot must drop the phantom 800000 — month-1 "Initial Balance" txn goes to 0
    const snapZeroed = await callTool(token, "plan_snapshot", { plan_id });
    expect(initBalanceTxnOf(snapZeroed)).toBe(0);
  });
});
