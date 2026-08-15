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
