import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/server/di/container";
import { ComputeSalaryNegotiation } from "@/server/tax/engine";

// One expensive container per process (mirrors app/api/assistant/chat/route.ts).
let containerPromise: Promise<Awaited<ReturnType<typeof buildContainer>>> | null = null;

function getContainer() {
  if (!containerPromise) {
    containerPromise = buildContainer().catch((err) => {
      console.error("[fi-plan] tax route build failed:", err);
      containerPromise = null;
      throw err;
    });
  }
  return containerPromise;
}

/** Session auth (auth-token header / signed session_id cookie) — mirrors the assistant route. */
async function resolveUserId(req: NextRequest, container: Awaited<ReturnType<typeof buildContainer>>) {
  let session_id =
    req.headers.get("auth-token") || req.headers.get("authtoken") || "";
  const signedCookie = req.cookies.get("session_id")?.value;
  if (signedCookie) {
    const verified = container.VerifyCookie(signedCookie, container.cookieSecret);
    if (verified) session_id = verified;
  }
  if (!session_id) return null;
  const session = await container.session_list.FindByActiveSessionId(session_id);
  if (!session) return null;
  return session.user_id;
}

/**
 * POST /api/tax/negotiation — salary-offer comparison against the versioned
 * tax rules (take-home + marginal tax rate on each hike). Body:
 * { current_gross, scenarios: [{label, new_gross}], regime?, assessment_year?,
 *   age_group?, deductions?, salary_structure? }
 */
export async function POST(req: NextRequest) {
  const container = await getContainer();
  const user_id = await resolveUserId(req, container);
  if (!user_id) {
    return NextResponse.json({ error: { message: "unauthenticated" } }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const { current_gross, scenarios: raw_scenarios, offers, regime, assessment_year, age_group, deductions, salary_structure } = body || {};
  // Accept both vocabularies: the canonical `scenarios: [{label, new_gross}]`
  // and a simple `offers: number[]` (mapped to "Offer N" labels).
  const scenarios =
    Array.isArray(raw_scenarios) && raw_scenarios.length > 0
      ? raw_scenarios
      : Array.isArray(offers) && offers.length > 0
        ? offers.map((o: number, i: number) => ({ label: `Offer ${i + 1}`, new_gross: o }))
        : [];
  if (typeof current_gross !== "number" || scenarios.length === 0) {
    return NextResponse.json(
      { error: { message: "current_gross (number) and scenarios ([{label, new_gross}]) are required" } },
      { status: 400 }
    );
  }

  const rules = await container.tax_service.getRules(assessment_year || (await container.tax_service.rulesForTimestamp(Date.now())).assessment_year);
  try {
    const result = ComputeSalaryNegotiation({
      rules,
      regime: regime === "old" ? "old" : "new",
      age_group: age_group || "below60",
      current_gross,
      scenarios,
      deductions,
      other_income: 0,
      salary_structure,
    });
    return NextResponse.json({ status: "success", data: result });
  } catch (e: any) {
    return NextResponse.json({ error: { message: String(e?.message || e) } }, { status: 400 });
  }
}
