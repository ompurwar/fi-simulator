import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, signupUser, type TestApp } from "../helpers";
import { makeToolRegistry, callRegistryTool } from "@/server/mcp/registry";
import type { ToolContext } from "@/server/mcp/types";
import { AY_RULE_SETS, ASSET_PRESETS } from "@/server/tax/rules-data";

let t: TestApp;
let userCtx: ToolContext;
let adminCtx: ToolContext;

beforeAll(async () => {
  t = await createTestApp();
  const { user } = await signupUser(t.app);
  userCtx = { user_id: user._id, role: "user" };
  adminCtx = { user_id: user._id, role: "admin" };

  // Seed the DB exactly like `npm run seed:tax-rules` does.
  for (const ruleSet of AY_RULE_SETS) {
    await t.container.tax_rule_repo.UpsertRuleSet({ ...ruleSet });
  }
  await t.container.tax_rule_repo.UpsertPresets({ ...ASSET_PRESETS });
});

afterAll(async () => {
  await t.stop();
});

describe("tax rule tools", () => {
  it("list_tax_rules returns the seeded assessment years from the DB", async () => {
    const res = await callRegistryTool(makeToolRegistry(t.container), userCtx, "list_tax_rules", {});
    expect(res.ok).toBe(true);
    const years = (res as any).data.map((y: any) => y.assessment_year);
    expect(years).toContain("2023-24");
    expect(years).toContain("2025-26");
    expect(years).toContain("2026-27");
  });

  it("get_tax_rules returns the full rule set for an assessment year", async () => {
    const res = await callRegistryTool(makeToolRegistry(t.container), userCtx, "get_tax_rules", {
      assessment_year: "2025-26",
    });
    expect(res.ok).toBe(true);
    const rules = (res as any).data.rules;
    expect(rules.assessment_year).toBe("2025-26");
    expect(rules.income_tax.regimes.new.std_deduction).toBe(75000);
    expect(rules.capital_gains.profiles.equity_listed_in.exemption_112a).toBe(125000);
  });

  it("tax_calculation resolves rules from the DB and computes the ClearTax example", async () => {
    const res = await callRegistryTool(makeToolRegistry(t.container), userCtx, "tax_calculation", {
      assessment_year: "2025-26",
      regime: "new",
      gross_salary: 1500000,
    });
    expect(res.ok).toBe(true);
    expect((res as any).data.total_tax).toBe(97500);
  });

  it("salary_negotiation returns take-home + marginal rates", async () => {
    const res = await callRegistryTool(makeToolRegistry(t.container), userCtx, "salary_negotiation", {
      assessment_year: "2025-26",
      regime: "new",
      current_gross: 1500000,
      scenarios: [{ label: "+20%", new_gross: 1800000 }],
    });
    expect(res.ok).toBe(true);
    const data = (res as any).data;
    expect(data.current.take_home).toBe(1402500);
    expect(data.scenarios[0].marginal_tax_rate_on_hike).toBeGreaterThan(0);
  });
});

describe("admin-gated system mutations (RBAC)", () => {
  it("upsert_tax_rules is FORBIDDEN for regular users", async () => {
    const res = await callRegistryTool(makeToolRegistry(t.container), userCtx, "upsert_tax_rules", {
      assessment_year: "2026-27",
      rules: { income_tax: {} },
    });
    expect(res.ok).toBe(false);
    expect((res as any).error.code).toBe("FORBIDDEN");
  });

  it("update_presets is FORBIDDEN for regular users", async () => {
    const res = await callRegistryTool(makeToolRegistry(t.container), userCtx, "update_presets", {
      asset_classes: { fd: { yield_rate: 7 } },
    });
    expect(res.ok).toBe(false);
    expect((res as any).error.code).toBe("FORBIDDEN");
  });

  it("admins can upsert a rule set and the new values take effect immediately", async () => {
    // Change the 2025-26 87A max rebate to 50k and verify tax_calculation picks it up.
    const upsert = await callRegistryTool(makeToolRegistry(t.container), adminCtx, "upsert_tax_rules", {
      assessment_year: "2025-26",
      rules: {
        income_tax: {
          regimes: {
            new: { rebate_87a: { income_limit: 1200000, max_rebate: 50000, marginal_relief: true } },
          },
        },
      },
    });
    expect(upsert.ok).toBe(true);

    const calc = await callRegistryTool(makeToolRegistry(t.container), userCtx, "tax_calculation", {
      assessment_year: "2025-26",
      regime: "new",
      gross_salary: 1275000, // taxable 12L → slab tax 60k
    });
    expect((calc as any).data.rebate_87a).toBe(50000);
    expect((calc as any).data.total_tax).toBe(10400); // (60k − 50k) + 4% cess
  });

  it("admins can update presets", async () => {
    const res = await callRegistryTool(makeToolRegistry(t.container), adminCtx, "update_presets", {
      asset_classes: { fd: { yield_rate: 7.25 } },
    });
    expect(res.ok).toBe(true);
    const presets = await t.container.tax_service.getPresets();
    expect(presets.asset_classes.fd.yield_rate).toBe(7.25);
    // bundled class untouched
    expect(presets.asset_classes.equity.growth_rate).toBe(12);
  });

  it("read tools stay available to regular users", async () => {
    const res = await callRegistryTool(makeToolRegistry(t.container), userCtx, "get_tax_rules", {
      assessment_year: "2026-27",
    });
    expect(res.ok).toBe(true);
  });
});
