import { describe, it, expect, beforeAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { buildContainer } from "@/server/di/container";
import { NextRequest } from "next/server";

// The route builds its own container from process.env — set env BEFORE importing it.
const mongo = await MongoMemoryServer.create();
process.env.DB_URL = mongo.getUri();
process.env.DB_NAME = "fi_plan_test_mcp_loans";
process.env.COOKIE_SECRET = "test-cookie-secret";

const { POST } = await import("../../app/api/mcp/route");

async function rpc(method: string, params: any, token?: string, id = 1) {
  const body = { jsonrpc: "2.0", id, method, params };
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await POST(new NextRequest("http://localhost:3001/api/mcp", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, text: await res.text() };
}

describe("loan prepayments + refinance over HTTP", () => {
  let container: Awaited<ReturnType<typeof buildContainer>>;
  let user_id: string;
  let token: string;
  let plan_id: string;

  /** tools/call a registry tool and return the parsed ok:true envelope. */
  async function callTool(name: string, args: any) {
    const res = await rpc("tools/call", { name, arguments: args }, token);
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.text);
    const envelope = JSON.parse(parsed.result?.content?.[0]?.text);
    expect(envelope.ok).toBe(true);
    return envelope;
  }

  beforeAll(async () => {
    container = await buildContainer();
    const session = await container.app.Signup({ email: `mcp-loans-${Date.now()}@test.com`, password: "secret123", first_name: "MCP", last_name: "Loans" });
    user_id = session.user_id;
    const created = await container.app.CreateApiToken({ user_id, name: "test-agent" });
    token = created.api_token;

    const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "vitest", version: "1" } }, token, 0);
    expect(init.status).toBe(200);

    const created_plan = await callTool("create_plan", {
      title: "HTTP loans plan",
      monthly_income: 300000,
      monthly_expense: 100000,
    });
    plan_id = created_plan.data.plan_id || created_plan.data._id;
  });

  it("tools/list exposes loan_refinance and prepayments in the loan tool schemas", async () => {
    const res = await rpc("tools/list", {}, token);
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.text);
    const tools: any[] = parsed.result?.tools;
    expect(Array.isArray(tools)).toBe(true);

    const names = tools.map((t) => t.name);
    expect(names).toContain("loan_refinance");
    expect(names).toContain("loan_amortization");
    expect(names).toContain("add_loan");
    expect(names).toContain("update_loan");

    const amortization = tools.find((t) => t.name === "loan_amortization");
    expect(amortization.inputSchema?.properties?.prepayments).toBeTruthy();

    const add_loan = tools.find((t) => t.name === "add_loan");
    expect(add_loan.inputSchema?.properties?.prepayments).toBeTruthy();

    const update_loan = tools.find((t) => t.name === "update_loan");
    expect(update_loan.inputSchema?.properties?.prepayments).toBeTruthy();
  });

  it("add_loan with prepayments persists them (get_plan + list_loans)", async () => {
    const add = await callTool("add_loan", {
      plan_id,
      title: "Home loan",
      principal_amount: 6500000,
      interest_rate: 8,
      start_month: 34,
      end_month: 274,
      deposit_to_bank: true,
      prepayments: [{ start_month: 40, amount: 25000, frequency: "m", step_pct: 10, step_frequency: "y" }],
    });
    expect(add.data).toBeTruthy();

    const expected_prepayments = [{ start_month: 40, amount: 25000, frequency: "m", step_pct: 10, step_frequency: "y" }];

    const plan = await callTool("get_plan", { plan_id });
    const loan = plan.data.loan_accounts.find((l: any) => l.title === "Home loan");
    expect(loan).toBeTruthy();
    expect(loan.prepayments).toEqual(expected_prepayments);

    const loans = await callTool("list_loans", { plan_id });
    expect(loans.data.find((l: any) => l.title === "Home loan").prepayments).toEqual(expected_prepayments);
  });

  it("plan_snapshot emits Prepayment expense rows and shortens the EMI schedule", async () => {
    const add = await callTool("add_loan", {
      plan_id,
      title: "Prepay Car",
      principal_amount: 800000,
      interest_rate: 10,
      start_month: 12,
      end_month: 72,
      deposit_to_bank: false,
      prepayments: [{ start_month: 24, amount: 100000, frequency: null }],
    });
    expect(add.data).toBeTruthy();

    const snap = await callTool("plan_snapshot", { plan_id, duration: 72 });
    const data = snap.data;
    expect(Array.isArray(data.emi_expense_cashflow)).toBe(true);

    const prepay_rows = data.emi_expense_cashflow.filter(
      (c: any) => c.desc && c.desc.startsWith("Prepayment #1 - ") && c.desc.includes("Prepay Car")
    );
    expect(prepay_rows).toHaveLength(1);
    expect(prepay_rows[0]).toMatchObject({ amount: 100000, start_month: 24 });

    const loan = data.loan_account_list.find((l: any) => l.title === "Prepay Car");
    expect(loan).toBeTruthy();
    const loan_emis = data.emi_schedule.filter((e: any) => String(e.loan_id) === String(loan._id));
    expect(loan_emis.length).toBeLessThan(61);
    expect(loan_emis[loan_emis.length - 1].closing_balance).toBeLessThanOrEqual(0.005);
  });

  it("loan_refinance returns the what-if analysis", async () => {
    const res = await callTool("loan_refinance", {
      amount: 6500000,
      interest_rate: 8.5,
      tenure: 240,
      refinance_month: 60,
      new_rate: 7,
      new_tenure: 180,
    });
    expect(res.data.outstanding_balance).toBeGreaterThan(0);
    expect(res.data.new_emi).toBeGreaterThan(0);
    expect(typeof res.data.breakeven_months).toBe("number");
    expect(typeof res.data.interest_saved).toBe("number");
  });

  it("simulate_plan accepts an add_loan patch with prepayments", async () => {
    const res = await callTool("simulate_plan", {
      plan_id,
      duration: 60,
      patches: [
        {
          op: "add_loan",
          loan: {
            amount: 2000000,
            interest_rate: 9,
            tenure: 120,
            start_month: 20,
            deposit_to_bank: false,
            prepayments: [{ start_month: 36, amount: 50000, frequency: "y", step_pct: 10 }],
          },
        },
      ],
    });
    expect(res.data.applied_patches).toHaveLength(1);
    expect(Array.isArray(res.data.snapshot.emi_expense_cashflow)).toBe(true);
  });
});