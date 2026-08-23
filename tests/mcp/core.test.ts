import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createTestApp, type TestApp } from "../helpers";
import { makeMcpServer } from "@/server/mcp/server";
import { makeToolRegistry, callRegistryTool } from "@/server/mcp/registry";
import { ApplyScenarioToPlan } from "@/server/mcp/simulate";
import { makeAuthInfo } from "@/server/mcp/auth";
import type { ToolContext } from "@/server/mcp/types";

let t: TestApp;

const EMPTY_PLAN = {
  _id: "plan1",
  title: "test plan",
  cashflow_list: [],
  account_list: [],
  cashflow_change_list: [],
  loan_accounts: [],
  fund_distribution_percentage: [],
};

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.stop();
});

describe("ApplyScenarioToPlan", () => {
  it("applies an add_income patch to a copy, leaving the original untouched", () => {
    const original = JSON.parse(JSON.stringify(EMPTY_PLAN));

    const scenario = ApplyScenarioToPlan(original, [
      {
        op: "add_income",
        cashflow: { desc: "side hustle", amount: 30000, start_month: 24, end_month: 60 },
      },
    ]);

    expect(scenario).not.toBe(original);
    expect(scenario.cashflow_list).toHaveLength(1);
    const added = scenario.cashflow_list[0];
    expect(added.category).toBe("i");
    expect(added.desc).toBe("side hustle");
    expect(added.amount).toBe(30000);
    expect(added.start_month).toBe(24);
    expect(added.end_month).toBe(60);

    expect(original).toEqual(EMPTY_PLAN);
  });

  it("throws InvalidPropertyError on unknown ops", () => {
    expect(() => ApplyScenarioToPlan(EMPTY_PLAN, [{ op: "delete_everything" }])).toThrowError(
      /unknown scenario op/
    );
  });

  it("accepts both loan vocabularies in add_loan patches (amount+tenure and principal_amount+end_month)", () => {
    const byTenure = ApplyScenarioToPlan(EMPTY_PLAN, [
      { op: "add_loan", loan: { amount: 400000, interest_rate: 10, tenure: 13, start_month: 40 } },
    ]);
    expect(byTenure.loan_accounts).toHaveLength(1);
    expect(byTenure.loan_accounts[0]).toMatchObject({
      principal_amount: 400000,
      start_month: 40,
      end_month: 52,
    });

    const byMonths = ApplyScenarioToPlan(EMPTY_PLAN, [
      {
        op: "add_loan",
        loan: { principal_amount: 500000, interest_rate: 9, start_month: 24, end_month: 84 },
      },
    ]);
    expect(byMonths.loan_accounts).toHaveLength(1);
    expect(byMonths.loan_accounts[0]).toMatchObject({
      principal_amount: 500000,
      start_month: 24,
      end_month: 84,
    });
  });

  it("add_cashflow_change patches replace existing same-line+month changes (parity with the persist tool)", () => {
    const plan: any = JSON.parse(JSON.stringify(EMPTY_PLAN));
    plan.cashflow_list = [{ _id: "cf1", category: "e" }];
    plan.cashflow_change_list = [
      {
        _id: "old",
        cashflow_id: "cf1",
        category: "e",
        change_type: "p",
        value: 8,
        start_month: 1,
        end_month: 60,
        frequency: "y",
      },
    ];

    const scenario = ApplyScenarioToPlan(plan, [
      { op: "add_cashflow_change", change: { cashflow_id: "cf1", change_category: "e", change_type: "p", value: 6, start_month: 1 } },
    ]);
    expect(scenario.cashflow_change_list).toHaveLength(1);
    expect(scenario.cashflow_change_list[0].value).toBe(6);
  });

  it("accepts FLAT patches and infers the op (no more format friction)", () => {
    const plan: any = JSON.parse(JSON.stringify(EMPTY_PLAN));
    plan.cashflow_list = [{ _id: "cf1", category: "e" }];

    const flat = ApplyScenarioToPlan(plan, [
      // flat add_cashflow_change — no op, no nested change
      { cashflow_id: "cf1", change_category: "e", change_type: "p", value: 6, start_month: 1, frequency: "y" },
      // flat add_income
      { desc: "side hustle", amount: 30000, start_month: 24, end_month: 60, category: "i" },
      // flat add_loan (tool vocabulary)
      { principal_amount: 400000, interest_rate: 10, start_month: 40, end_month: 52 },
    ]);
    expect(flat.cashflow_change_list).toHaveLength(1);
    expect(flat.cashflow_change_list[0]).toMatchObject({ cashflow_id: "cf1", value: 6, frequency: "y" });
    const income = (flat.cashflow_list || []).find((c: any) => c.category === "i");
    expect(income).toMatchObject({ desc: "side hustle", amount: 30000 });
    const loan = flat.loan_accounts[0];
    expect(loan).toMatchObject({ principal_amount: 400000, start_month: 40, end_month: 52 });
  });

  it("accepts flat set_account_balance when the account exists", () => {
    const plan: any = JSON.parse(JSON.stringify(EMPTY_PLAN));
    plan.account_list = [{ _id: "acc1", category: "s" }];

    const scenario = ApplyScenarioToPlan(plan, [
      { account_id: "acc1", month: 12, balance: 500000 },
    ]);
    expect(scenario.account_list[0].init_balance).toBe(500000);
    expect(scenario.account_list[0].balance_month).toBe(12);
  });

  it("still rejects unknown ops with the schema hint", () => {
    expect(() => ApplyScenarioToPlan(EMPTY_PLAN, [{ op: "delete_everything" }])).toThrowError(
      /unknown scenario op/
    );
  });

  it("throws InvalidPropertyError on a category that contradicts the op", () => {
    expect(() =>
      ApplyScenarioToPlan(EMPTY_PLAN, [
        { op: "add_income", cashflow: { desc: "wrong cat", amount: 1000, start_month: 1, category: "e" } },
      ])
    ).toThrowError(/category/);
  });
});

describe("registry wiring", () => {
  it("exposes the core tool set in order", () => {
    const registry = makeToolRegistry(t.container);
    const names = registry.map((def) => def.name);
    for (const expected of [
      "list_plans",
      "get_plan",
      "create_plan",
      "plan_snapshot",
      "simulate_plan",
      "add_income",
      "list_expense",
      "add_cashflow_change",
      "networth_status",
      "create_share_object",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("wraps handler failures into error envelopes via callRegistryTool", async () => {
    const registry = makeToolRegistry(t.container);
    const ctx: ToolContext = { user_id: "does-not-exist" };
    const result = await callRegistryTool(registry, ctx, "get_plan", { plan_id: "nope" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBeTruthy();
      expect(result.error.message).toBeTruthy();
    }
  });

  it("returns an UNKNOWN_TOOL envelope for missing names", async () => {
    const result = await callRegistryTool([], { user_id: "u" }, "no_such_tool", {});
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN_TOOL", message: "unknown tool: no_such_tool" } });
  });
});

describe("MCP protocol round trip", () => {
  it("serves list_plans with an ok envelope through InMemoryTransport", async () => {
    const server = makeMcpServer(t.container);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const origSend = clientTransport.send.bind(clientTransport);
    clientTransport.send = async (msg, opts) => origSend(msg, { ...opts, authInfo: makeAuthInfo("some-user") });

    const client = new Client({ name: "test", version: "1" }, { capabilities: {} });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = (await client.callTool({ name: "list_plans", arguments: {} })) as any;

    expect(result.isError).toBeFalsy();
    const text = result.content.find((c: any) => c.type === "text") as { text: string } | undefined;
    expect(text).toBeTruthy();
    const envelope = JSON.parse(text!.text);
    expect(envelope.ok).toBe(true);
    expect(Array.isArray(envelope.data)).toBe(true);

    await client.close();
    await server.close();
  });

  it("rejects tool calls without auth context", async () => {
    const server = makeMcpServer(t.container);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client({ name: "test", version: "1" }, { capabilities: {} });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = (await client.callTool({ name: "list_plans", arguments: {} })) as any;

    expect(result.isError).toBe(true);
    const text = result.content.find((c: any) => c.type === "text") as { text: string } | undefined;
    const envelope = JSON.parse(text!.text);
    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe("UNAUTHORIZED");

    await client.close();
    await server.close();
  });
});
