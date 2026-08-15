import { MongoMemoryServer } from "mongodb-memory-server";
import { buildContainer, type Container } from "@/server/di/container";
import { buildApp } from "@/server/http/app";
import type { NetWorthProvider } from "@/server/networth";

/** A running test instance: in-memory Mongo + wired container + fetch handler. */
export interface TestApp {
  container: Container;
  app: (req: Request) => Promise<Response>;
  mongo: MongoMemoryServer;
  stop: () => Promise<void>;
}

const TEST_ENV: Record<string, string> = {
  NODE_ENV: "test",
  DB_URL: "mongodb://localhost:27017", // replaced by the memory server
  DB_NAME: "fi_plan_test",
  CLIENT_APPLICATION: "http://localhost:3001",
  COOKIE_SECRET: "test-cookie-secret",
  COOKIE_SEC: "test-cookie-sec",
  DEFAULT_PLAN_DURATION: "600",
  SESSION_TIMEOUT: "24",
  PW_RESET_SESSION_LENGTH: "30",
};

let cached: MongoMemoryServer | null = null;

async function getMongo(): Promise<MongoMemoryServer> {
  if (!cached) {
    cached = await MongoMemoryServer.create();
  }
  return cached;
}

/** Boot one sociable test instance against a fresh in-memory Mongo. */
export async function createTestApp(
  overrides: { networthProvider?: NetWorthProvider } = {}
): Promise<TestApp> {
  const mongo = await getMongo();
  const dbUrl = mongo.getUri();
  const container = await buildContainer({ ...TEST_ENV, DB_URL: dbUrl }, overrides);
  const app = buildApp(container);
  return {
    container,
    app,
    mongo,
    stop: async () => {
      /* mongodb-memory-server is shared for the process; nothing to close. */
    },
  };
}

/** POST a JSON body to the test app and parse the envelope. */
export async function post(
  app: TestApp["app"],
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; json: any; cookies: string[] }> {
  const res = await app(
    new Request(`http://localhost:3001${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
  );
  const json = await res.json().catch(() => null);
  return { status: res.status, json, cookies: res.headers.getSetCookie?.() || [] };
}

/** Extract the session_id cookie from a Set-Cookie header list. */
export function sessionIdFromCookies(cookies: string[]): string {
  const raw = cookies.find((c) => c.startsWith("session_id="));
  if (!raw) return "";
  // format: session_id=<value>.<sig>; Max-Age=...
  return raw.split(";")[0].split("=")[1]?.split(".")[0] || "";
}

/** Sign up a fresh user and return { user, session_id, email, password }. */
export async function signupUser(
  app: TestApp["app"],
  opts: { email?: string; password?: string } = {}
) {
  const email = opts.email || `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
  const password = opts.password || "secret123";
  const res = await post(app, "/api/signup", {
    data: { email, password, first_name: "Test", last_name: "User" },
  });
  if (res.json?.status !== "success") {
    throw new Error(`signup failed: ${JSON.stringify(res.json)}`);
  }
  const session_id = sessionIdFromCookies(res.cookies);
  // signup returns the session; fetch the profile with the session token
  const profile = await post(app, "/api/user/get/profile", { data: {} }, { "auth-token": session_id });
  return { user: profile.json?.data || {}, email, password, session_id };
}
