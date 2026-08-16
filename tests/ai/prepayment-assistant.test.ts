import { describe, expect, it, beforeAll, afterEach, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { buildContainer } from "@/server/di/container";
import { makeToolRegistry, callRegistryTool } from "@/server/mcp/registry";
import { NextRequest } from "next/server";

// The route builds its own container from process.env — set env BEFORE importing it.
const mongo = await MongoMemoryServer.create();
process.env.DB_URL = mongo.getUri();
process.env.DB_NAME = "fi_plan_test_ai_prepay";
process.env.COOKIE_SECRET = "test-cookie-secret";
process.env.ANTHROPIC_API_KEY = "test-key";

const { POST } = await import("../../app/api/assistant/chat/route");

function parseSse(text: string): any[] {
  const events: any[] = [];
  for (const frame of text.split("\n\n")) {
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload && payload !== "[DONE]") events.push(JSON.parse(payload));
    }
  }
  return events;
}

function sseBody(events: any[]): ReadableStream<Uint8Array> {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function textOnlySse(text: string): any[] {
  return [
    { type: "message_start", message: { id: "msg_1" } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    { type: "content_block_stop", index: 0 },
    { type: "message_stop" },
  ];
}

/** One LLM turn: a tool_use with full JSON args, then a final text answer. */
function toolTurnSse(name: string, args: Record<string, any>, answer: string): any[] {
  return [
    { type: "message_start", message: { id: "msg_1" } },
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name, input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(args) } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: answer } },
    { type: "content_block_stop", index: 1 },
    { type: "message_stop" },
  ];
}

/**
 * The ONLY mock in these tests: the external LLM API. Each scripted call returns
 * a scripted Anthropic SSE body, and every request body the real provider sent
 * is captured for assertions (system prompt + tool_result round-trips).
 */
function scriptedFetch(scripts: ((call: number) => any[])[]) {
  const requests: any[] = [];
  const spy = vi.spyOn(global, "fetch").mockImplementation(async (_input: any, init: any) => {
    requests.push(JSON.parse(init.body));
    const events = scripts[Math.min(requests.length - 1, scripts.length - 1)](requests.length);
    return new Response(sseBody(events), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  });
  return { spy, requests };
}

// Extract the tool_result payload the assistant was fed back for the LAST tool
// it ran (the final LLM request carries the previous turn's tool_result block).
function lastToolResultPayload(requests: any[]): any {
  const lastRequest = requests[requests.length - 1];
  const toolResults = lastRequest.messages.filter(
    (m: any) => m.role === "user" && m.content?.[0]?.type === "tool_result"
  );
  expect(toolResults.length).toBeGreaterThan(0);
  return JSON.parse(toolResults[toolResults.length - 1].content[0].content);
}

describe("in-app assistant loan prepayments", () => {
  let container: Awaited<ReturnType<typeof buildContainer>>;
  let session_id: string;
  let user_id: string;

  beforeAll(async () => {
    // Same env as the route → same database; the route's own container will see this session.
    container = await buildContainer();
    const session = await container.app.Signup({
      email: `prepay-${Date.now()}@test.com`,
      password: "secret123",
      first_name: "Prepay",
      last_name: "User",
    });
    session_id = session.session_id;
    user_id = session.user_id;
  });

  afterEach(() => vi.restoreAllMocks());

  async function chat(body: unknown) {
    const res = await POST(
      new NextRequest("http://localhost:3001/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "auth-token": session_id },
        body: JSON.stringify(body),
      })
    );
    return { status: res.status, text: await res.text() };
  }

  async function seedPlan(): Promise<string> {
    const created = await callRegistryTool(
      makeToolRegistry(container),
      { user_id },
      "create_plan",
      { title: "Prepay plan", monthly_income: 300000, monthly_expense: 100000 }
    );
    expect(created.ok).toBe(true);
    return String((created as any).data._id);
  }

  it("models a prepayment on a real loan: add_loan with prepayments, snapshot grounded in the engine, answer persisted", async () => {
    const plan_id = await seedPlan();

    const addLoanArgs = {
      plan_id,
      title: "Home loan",
      principal_amount: 5000000,
      interest_rate: 8.5,
      start_month: 12,
      end_month: 251,
      deposit_to_bank: false,
      prepayments: [{ start_month: 24, amount: 25000, frequency: "m", step_pct: 10, step_frequency: "y" }],
    };
    const { requests } = scriptedFetch([
      () => toolTurnSse("add_loan", addLoanArgs, "Done — added the ₹25,000 monthly prepayment (10% yearly step-up)."),
      () => toolTurnSse("plan_snapshot", { plan_id, duration: 60, summary: false }, "Confirmed."),
      () => textOnlySse("Done — added the ₹25,000 monthly prepayment (10% yearly step-up)."),
    ]);

    const res = await chat({
      messages: [
        { role: "user", content: "Add a ₹25,000 monthly prepayment to my home loan from month 24, growing 10% every year." },
      ],
    });
    expect(res.status).toBe(200);
    const events = parseSse(res.text);

    // Turn succeeded: no error, tool calls + mutation + final text + done.
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(events[events.length - 1]).toEqual({ type: "done" });
    expect(events.some((e) => e.type === "text" && e.text.includes("prepayment"))).toBe(true);
    expect(events.find((e) => e.type === "mutation")).toMatchObject({
      type: "mutation",
      tools: ["add_loan"],
      plan_ids: [plan_id],
    });

    // The assistant reply was persisted, tagged with the tools it ran.
    const stored = await container.app.GetChatSession({ user_id, session_id: events[0].id });
    expect(stored.messages).toHaveLength(2);
    expect(stored.messages[0]).toMatchObject({ role: "user" });
    expect(stored.messages[1]).toMatchObject({
      role: "assistant",
      content: expect.stringContaining("prepayment"),
      tools: expect.arrayContaining(["add_loan", "plan_snapshot"]),
    });

    // The loan really was persisted WITH its prepayments.
    const registry = makeToolRegistry(container);
    const loans = await callRegistryTool(registry, { user_id }, "list_loans", { plan_id });
    expect(loans.ok).toBe(true);
    const loan = (loans as any).data.find((l: any) => l.title === "Home loan");
    expect(loan.prepayments).toEqual([
      { start_month: 24, amount: 25000, frequency: "m", step_pct: 10, step_frequency: "y" },
    ]);

    // What the assistant was fed back (plan_snapshot's tool_result) is grounded
    // in the real engine: the snapshot it received contains the Prepayment row.
    const payload = lastToolResultPayload(requests);
    expect(payload.ok).toBe(true);
    // The snapshot the assistant received is real engine output: the monthly
    // prepayment schedule is modelled row by row ("Prepayment #N"), the first
    // row being the ₹25,000 payment at month 24.
    const rows = payload.data.emi_expense_cashflow.filter(
      (c: any) => c.desc && c.desc.startsWith("Prepayment #") && c.desc.includes("Home loan")
    );
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0]).toMatchObject({ desc: "Prepayment #1 - 'Home loan'", amount: 25000, start_month: 24, frequency: null });

    // And independently: a fresh plan_snapshot call shows the same row.
    const snap = await callRegistryTool(registry, { user_id }, "plan_snapshot", { plan_id, duration: 60 });
    const snapRows = (snap as any).data.emi_expense_cashflow.filter(
      (c: any) => c.desc === "Prepayment #1 - 'Home loan'"
    );
    expect(snapRows).toHaveLength(1);
    expect(snapRows[0].amount).toBe(25000);
  });

  it("analyzes a refinance (read-only) before persisting — plan untouched", async () => {
    const plan_id = await seedPlan();

    const { requests } = scriptedFetch([
      () =>
        toolTurnSse(
          "loan_refinance",
          { amount: 5000000, interest_rate: 9, tenure: 240, refinance_month: 120, new_rate: 7, new_tenure: 120 },
          "Refinancing at 7% saves you ₹6.2L — want me to model it on the plan?"
        ),
      () => textOnlySse("Refinancing at 7% saves you money."),
    ]);

    const res = await chat({
      messages: [
        { role: "user", content: "Refinance my 50 lakh home loan at 9% for 20 years — analyze refinancing at 7% over 10 years from month 120 first." },
      ],
    });
    expect(res.status).toBe(200);
    const events = parseSse(res.text);
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(events[events.length - 1]).toEqual({ type: "done" });
    // loan_refinance is read-only — the assistant must NOT emit a mutation event.
    expect(events.some((e) => e.type === "mutation")).toBe(false);

    const stored = await container.app.GetChatSession({ user_id, session_id: events[0].id });
    expect(stored.messages).toHaveLength(2);
    expect(stored.messages[1]).toMatchObject({
      role: "assistant",
      content: expect.stringContaining("Refinancing"),
      tools: ["loan_refinance"],
    });

    // The analysis the model received is real engine output…
    const payload = lastToolResultPayload(requests);
    expect(payload.ok).toBe(true);
    expect(payload.data).toMatchObject({ interest_saved: expect.any(Number), new_emi: expect.any(Number) });
    expect(payload.data.new_emi).toBeLessThan(payload.data.old_emi);

    // …and nothing was persisted: no loans were added to the plan.
    const registry = makeToolRegistry(container);
    const loans = await callRegistryTool(registry, { user_id }, "list_loans", { plan_id });
    expect(loans.ok).toBe(true);
    expect((loans as any).data).toEqual([]);
    const plan = await container.plan_list.FindById(plan_id);
    expect(plan?.loan_accounts).toEqual([]);
  });

  it("teaches prepayment semantics in the system prompt", async () => {
    const { requests } = scriptedFetch([
      () => textOnlySse("Hi! I can help with your financial plan — ask me about loans, prepayments or refinancing."),
    ]);

    const res = await chat({ messages: [{ role: "user", content: "hi there" }] });
    expect(res.status).toBe(200);
    expect(parseSse(res.text).some((e) => e.type === "text")).toBe(true);

    const system = requests[0].system as string;
    expect(system).toContain("step_frequency");
    expect(system).toContain("Prepayment #N");
    expect(system).toContain("loan_refinance");
    expect(system).toContain("{start_month, amount, frequency: 'm'|'q'|'y'|null, step_pct?, step_frequency?}");
  });
});