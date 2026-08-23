import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/server/di/container";
import { ApplyScenarioToPlan } from "@/server/mcp/simulate";

// One expensive container per process (mirrors app/api/tax/negotiation/route.ts).
let containerPromise: Promise<Awaited<ReturnType<typeof buildContainer>>> | null = null;

function getContainer() {
  if (!containerPromise) {
    containerPromise = buildContainer().catch((err) => {
      console.error("[fi-plan] scenario route build failed:", err);
      containerPromise = null;
      throw err;
    });
  }
  return containerPromise;
}

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
 * POST /api/engine/scenario — apply what-if patches to a DEEP COPY of the plan
 * and return the projected snapshot. Uses the exact same engine pair as the MCP
 * simulate_plan tool (ApplyScenarioToPlan → PlanSnapshot), so UI simulations
 * and agent simulations are numerically identical. NEVER persists.
 * Body: { plan_id, patches: [{op, ...}], duration? }
 * Returns: { snapshot, applied_patches }
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

  const { plan_id, patches, duration } = body || {};
  if (typeof plan_id !== "string" || plan_id.length === 0 || !Array.isArray(patches)) {
    return NextResponse.json(
      { error: { message: "plan_id (string) and patches (array) are required" } },
      { status: 400 }
    );
  }
  // hardening: cap the patch count (an authenticated user can otherwise burn CPU)
  const MAX_PATCHES = 50;
  if (patches.length > MAX_PATCHES) {
    return NextResponse.json(
      { error: { message: `too many patches — max ${MAX_PATCHES} per request` } },
      { status: 400 }
    );
  }

  const plan: any = await container.plan_list.FindById(plan_id);
  if (!plan) {
    return NextResponse.json({ error: { message: "plan not found" } }, { status: 404 });
  }
  if (plan.user_id?.toString() !== user_id) {
    return NextResponse.json({ error: { message: "forbidden" } }, { status: 403 });
  }

  try {
    const patched = ApplyScenarioToPlan(plan, patches);
    const snapshot = await container.app.PlanSnapshot({ plan: patched, duration });
    return NextResponse.json({ status: "success", data: { snapshot, applied_patches: patches } });
  } catch (e: any) {
    return NextResponse.json({ error: { message: String(e?.message || e) } }, { status: 400 });
  }
}
