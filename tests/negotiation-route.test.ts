import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { buildContainer } from "@/server/di/container";
import { NextRequest } from "next/server";
import { signupUser } from "./helpers";

// The route builds its own container from process.env — set env BEFORE importing it.
const mongo = await MongoMemoryServer.create();
process.env.DB_URL = mongo.getUri();
process.env.DB_NAME = "fi_plan_test_negotiation";
process.env.COOKIE_SECRET = "test-cookie-secret";

const { POST } = await import("../app/api/tax/negotiation/route");

let container: Awaited<ReturnType<typeof buildContainer>>;
let session_id: string;

async function negotiate(body: unknown, headers: Record<string, string> = {}) {
  const res = await POST(
    new NextRequest("http://localhost:3001/api/tax/negotiation", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, json: await res.json().catch(() => null) };
}

beforeAll(async () => {
  container = await buildContainer();
  const app = (await import("@/server/http/app")).buildApp(container);
  const signed = await signupUser(app);
  session_id = signed.session_id;
});

afterAll(async () => {
  await mongo.stop();
});

describe("POST /api/tax/negotiation", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await negotiate({
      current_gross: 3600000,
      scenarios: [{ label: "+10%", new_gross: 3960000 }],
    });
    expect(res.status).toBe(401);
  });

  it("computes take-home + marginal rate for canonical scenarios", async () => {
    const res = await negotiate(
      {
        current_gross: 3600000,
        regime: "new",
        age_group: "below60",
        scenarios: [
          { label: "+10%", new_gross: 3960000 },
          { label: "+20%", new_gross: 4320000 },
        ],
      },
      { "auth-token": session_id }
    );
    expect(res.status).toBe(200);
    const data = res.json.data;
    expect(data.current.gross).toBe(3600000);
    expect(data.scenarios).toHaveLength(2);
    expect(data.scenarios[0].label).toBe("+10%");
    expect(data.scenarios[0].marginal_tax_rate_on_hike).toBeGreaterThan(0);
    expect(data.scenarios[0].take_home).toBeLessThan(data.scenarios[0].gross);
  });

  it("accepts the simple offers: number[] vocabulary (UI backward compat)", async () => {
    const res = await negotiate(
      { current_gross: 3600000, offers: [4320000] },
      { "auth-token": session_id }
    );
    expect(res.status).toBe(200);
    const data = res.json.data;
    expect(data.scenarios).toHaveLength(1);
    expect(data.scenarios[0].label).toBe("Offer 1");
    expect(data.scenarios[0].gross).toBe(4320000);
  });

  it("returns 400 when both vocabularies are missing", async () => {
    const res = await negotiate({ current_gross: 3600000 }, { "auth-token": session_id });
    expect(res.status).toBe(400);
    expect(res.json.error.message).toContain("scenarios");
  });

  it("honors senior slabs via age_group (old-regime 3L exemption)", async () => {
    // 8L old regime: senior (3L exempt) → 60,000 + cess vs below-60 (2.5L exempt) → 62,500 + cess
    const senior = await negotiate(
      { current_gross: 800000, regime: "old", age_group: "senior", scenarios: [{ label: "x", new_gross: 800000 }] },
      { "auth-token": session_id }
    );
    const below = await negotiate(
      { current_gross: 800000, regime: "old", age_group: "below60", scenarios: [{ label: "x", new_gross: 800000 }] },
      { "auth-token": session_id }
    );
    expect(senior.status).toBe(200);
    expect(below.status).toBe(200);
    expect(senior.json.data.current.tax).toBeGreaterThan(0);
    expect(senior.json.data.current.tax).toBeLessThan(below.json.data.current.tax);
  });
});
