import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/server/di/container";
import { BuildAssetsFromNetWorth } from "@/server/networth";

// One expensive container per process (mirrors app/api/assistant/chat/route.ts).
let containerPromise: Promise<Awaited<ReturnType<typeof buildContainer>>> | null = null;

function getContainer() {
  if (!containerPromise) {
    containerPromise = buildContainer().catch((err) => {
      console.error("[fi-plan] plan-import route build failed:", err);
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

/** POST /api/plan/import_networth — seed plan assets from the user's net-worth snapshot. */
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
  const plan_id = body?.plan_id;
  if (typeof plan_id !== "string" || plan_id.length === 0) {
    return NextResponse.json({ error: { message: "plan_id is required" } }, { status: 400 });
  }

  const plan: any = await container.plan_list.FindById(plan_id);
  if (!plan) {
    return NextResponse.json({ error: { message: "plan not found" } }, { status: 404 });
  }
  if (plan.user_id?.toString() !== user_id) {
    return NextResponse.json({ error: { message: "forbidden" } }, { status: 403 });
  }

  const status = await container.networth_service.GetStatus({ user_id });
  const snapshot = status?.snapshot;
  if (!snapshot || !Array.isArray(snapshot.allocation)) {
    return NextResponse.json({ error: { message: "no net-worth snapshot — connect and sync a provider first" } }, { status: 400 });
  }

  const mode = body?.mode || "add_only"; // "refresh" | "rebuild" | "add_only"
  const presets = await container.tax_service.getPresets();
  const mapped = BuildAssetsFromNetWorth(snapshot.allocation, presets);

  let asset_list = [...(plan.asset_list || [])];
  const added: any[] = [];
  const skipped: string[] = [];
  const refreshed: string[] = [];

  if (mode === "rebuild") {
    const imported_classes = new Set(mapped.map((m) => m.asset_class));
    asset_list = asset_list.filter((a: any) => !imported_classes.has(a.asset_class));
    for (const asset of mapped) {
      asset_list.push(asset);
      added.push({ asset_class: asset.asset_class, principal: asset.principal });
    }
  } else if (mode === "refresh") {
    for (const imported of mapped) {
      const existing = asset_list.find((a: any) => a.asset_class === imported.asset_class);
      if (existing) {
        existing.principal = imported.principal;
        refreshed.push(imported.asset_class);
      } else {
        asset_list.push(imported);
        added.push({ asset_class: imported.asset_class, principal: imported.principal });
      }
    }
  } else {
    // add_only (default/legacy)
    const existing_classes = new Set(asset_list.map((a: any) => a.asset_class));
    for (const asset of mapped) {
      if (existing_classes.has(asset.asset_class)) {
        skipped.push(asset.asset_class);
        continue;
      }
      asset_list.push(asset);
      added.push({ asset_class: asset.asset_class, principal: asset.principal });
    }
  }

  if (added.length > 0 || refreshed.length > 0 || mode === "rebuild") {
    await container.app.UpdatePlan({ _id: plan_id, user_id, ...plan, asset_list });
  }
  return NextResponse.json({ status: "success", data: { added, skipped, refreshed, mode } });
}
