import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, signupUser, type TestApp } from "../helpers";
import { makeToolRegistry } from "@/server/mcp/registry";
import { runAgentLoop } from "@/server/ai/agent";
import type { AiMessage, AiProvider, AiStreamEvent } from "@/server/ai/types";

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.stop();
});

/** Scripted fake provider — the allowed boundary for provider tests. */
function fakeProvider(steps: ((call: number) => { text?: string; tool?: { name: string; args: Record<string, any> } } | null)[]): AiProvider & { calls: number } {
  let calls = 0;
  const provider: AiProvider & { calls: number } = {
    calls: 0,
    stream: async function* () {
      calls++;
      provider.calls = calls;
      const step = steps[Math.min(calls - 1, steps.length - 1)]?.(calls);
      if (step?.text) yield { type: "text_delta", text: step.text };
      if (step?.tool) yield { type: "tool_use", name: step.tool.name, args: step.tool.args };
    },
  };
  return provider;
}

describe("runAgentLoop", () => {
  it("executes a tool_use round-trip and streams text + tool events", async () => {
    const { session_id } = await signupUser(t.app);
    const session = await t.container.session_list.FindByActiveSessionId(session_id);
    const user_id = session!.user_id;

    const provider = fakeProvider([
      () => ({ text: "Thinking...", tool: { name: "create_plan", args: { title: "AI Plan", monthly_income: 100000, monthly_expense: 40000 } } }),
      () => ({ text: "Created." }),
    ]);

    const events: AiStreamEvent[] = [];
    await runAgentLoop({
      ctx: { user_id },
      messages: [{ role: "user", content: "Create a plan called AI Plan" }],
      registry: makeToolRegistry(t.container),
      provider,
      onEvent: (e) => events.push(e),
    });

    expect(events.filter((e) => e.type === "text").map((e) => (e as any).text)).toEqual([
      "Thinking...",
      "Created.",
    ]);
    expect(events.find((e) => e.type === "tool_call")).toMatchObject({
      type: "tool_call",
      name: "create_plan",
    });
    expect(events.find((e) => e.type === "tool_result")).toMatchObject({
      type: "tool_result",
      name: "create_plan",
      ok: true,
    });
    expect(events[events.length - 1]).toEqual({ type: "done" });

    const plans = await t.container.plan_list.FindByUserId(user_id);
    expect(plans.some((p: any) => p.title === "AI Plan")).toBe(true);
  });

  it("stops at the iteration cap when the provider keeps requesting tools", async () => {
    const { session_id } = await signupUser(t.app);
    const session = await t.container.session_list.FindByActiveSessionId(session_id);
    const user_id = session!.user_id;

    const provider = fakeProvider([
      () => ({ tool: { name: "list_plans", args: {} } }),
    ]);

    const events: AiStreamEvent[] = [];
    await runAgentLoop({
      ctx: { user_id },
      messages: [{ role: "user", content: "loop forever" }],
      registry: makeToolRegistry(t.container),
      provider,
      onEvent: (e) => events.push(e),
    });

    expect(provider.calls).toBeLessThanOrEqual(9);
    expect(events.find((e) => e.type === "error")).toEqual({
      type: "error",
      message: "iteration limit",
    });
    expect(events[events.length - 1]).toEqual({ type: "done" });
  });

  it("surfaces provider failures as an error event without crashing", async () => {
    const { session_id } = await signupUser(t.app);
    const session = await t.container.session_list.FindByActiveSessionId(session_id);
    const user_id = session!.user_id;

    const provider: AiProvider = {
      stream: async function* () {
        throw new Error("anthropic blew up");
      },
    };

    const events: AiStreamEvent[] = [];
    await expect(
      runAgentLoop({
        ctx: { user_id },
        messages: [{ role: "user", content: "hi" }],
        registry: makeToolRegistry(t.container),
        provider,
        onEvent: (e) => events.push(e),
      })
    ).resolves.toBeUndefined();

    expect(events.find((e) => e.type === "error")).toMatchObject({
      type: "error",
      message: "anthropic blew up",
    });
    expect(events.some((e) => e.type === "tool_call")).toBe(false);
  });

  it("relays tool failures as ok:false tool_result events", async () => {
    const { session_id } = await signupUser(t.app);
    const session = await t.container.session_list.FindByActiveSessionId(session_id);
    const user_id = session!.user_id;

    const provider = fakeProvider([
      () => ({ tool: { name: "create_plan", args: {} } }), // missing required title
      () => ({ text: "done" }),
    ]);

    const events: AiStreamEvent[] = [];
    await runAgentLoop({
      ctx: { user_id },
      messages: [{ role: "user", content: "make a plan" }],
      registry: makeToolRegistry(t.container),
      provider,
      onEvent: (e) => events.push(e),
    });

    const result = events.find((e) => e.type === "tool_result");
    expect(result).toMatchObject({ type: "tool_result", name: "create_plan", ok: false });
    expect((result as any).error).toBeTruthy();
    expect(events[events.length - 1]).toEqual({ type: "done" });
  });
});
