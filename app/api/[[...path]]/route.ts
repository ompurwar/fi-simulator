import { NextRequest } from "next/server";
import { buildContainer } from "@/server/di/container";
import { buildApp } from "@/server/http/app";

// The embedded server is built once per process (Next.js edge/node runtime).
// Build eagerly at module load so the first request never races a cold build;
// if the build rejects, the promise is cleared so the next request retries
// instead of poisoning the singleton permanently.
let appPromise: Promise<ReturnType<typeof buildApp>> | null = null;

function getApp() {
  if (!appPromise) {
    appPromise = buildContainer()
      .then((container) => buildApp(container))
      .catch((err) => {
        console.error("[fi-plan] embedded server build failed:", err);
        appPromise = null; // allow retry on next request
        throw err;
      });
  }
  return appPromise;
}

// Eager build at module load (catches DB/env issues early in dev and prod).
void getApp();

export async function GET(req: NextRequest) {
  const app = await getApp();
  return app(req);
}

export async function POST(req: NextRequest) {
  const app = await getApp();
  return app(req);
}

export async function PUT(req: NextRequest) {
  const app = await getApp();
  return app(req);
}

export async function DELETE(req: NextRequest) {
  const app = await getApp();
  return app(req);
}

export async function PATCH(req: NextRequest) {
  const app = await getApp();
  return app(req);
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, PATCH, DELETE",
      "Access-Control-Allow-Headers": "Content-Type, AuthToken, auth-token, X-Requested-With, baggage, sentry-trace",
    },
  });
}
