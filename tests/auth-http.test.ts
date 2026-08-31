import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, post, type TestApp } from "./helpers";

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.stop();
});

function cookieFrom(cookies: string[], name: string): string {
  const raw = cookies.find((c) => c.startsWith(`${name}=`));
  if (!raw) return "";
  return raw.split(";")[0].split("=")[1] || "";
}

async function callWithCookies(path: string, body: unknown, cookieHeader: string) {
  const p = path.startsWith("/api") ? path.slice(4) : path;
  return t.app(
    new Request(`http://localhost:3001/api${p}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: JSON.stringify(body),
    })
  );
}

describe("JWT access/refresh auth over HTTP", () => {
  it("login sets fp_access + fp_refresh cookies and the access cookie authenticates", async () => {
    const email = `auth-${Date.now()}@test.com`;
    const password = "secret123";
    await post(t.app, "/api/signup", {
      data: { email, password, first_name: "A", last_name: "B" },
    });
    const res = await post(t.app, "/api/login", { data: { email, password } });
    expect(res.json.status).toBe("success");
    const access = cookieFrom(res.cookies, "fp_access");
    const refresh = cookieFrom(res.cookies, "fp_refresh");
    expect(access).toContain("eyJ");
    expect(refresh).toContain("fp_rt_");

    // protected route authenticated purely by the access JWT cookie
    const profile = await callWithCookies("/api/user/get/profile", { data: {} }, `fp_access=${access}`);
    expect(profile.status).toBe(200);
    const body = await profile.json();
    expect(body.status).toBe("success");
    expect(body.data.email).toBe(email);
  });

  it("refresh rotates the pair; the old refresh is single-use", async () => {
    const email = `auth2-${Date.now()}@test.com`;
    const password = "secret123";
    await post(t.app, "/api/signup", {
      data: { email, password, first_name: "A", last_name: "B" },
    });
    const res = await post(t.app, "/api/login", { data: { email, password } });
    const refresh = cookieFrom(res.cookies, "fp_refresh");

    const refreshed = await callWithCookies("/api/auth/refresh", {}, `fp_refresh=${refresh}`);
    expect(refreshed.status).toBe(200);
    const newAccess = cookieFrom(refreshed.headers.getSetCookie?.() || [], "fp_access");
    const newRefresh = cookieFrom(refreshed.headers.getSetCookie?.() || [], "fp_refresh");
    expect(newAccess).toContain("eyJ");
    expect(newRefresh).toContain("fp_rt_");

    const profile = await callWithCookies("/api/user/get/profile", { data: {} }, `fp_access=${newAccess}`);
    expect(profile.status).toBe(200);

    // old refresh can no longer rotate — 401 in the error envelope
    const again = await callWithCookies("/api/auth/refresh", {}, `fp_refresh=${refresh}`);
    const againBody = await again.json();
    expect(again.status).toBe(200);
    expect(againBody.status).toBe("error");
    expect(againBody.error.code).toBe(401);
  });

  it("logout revokes the access token and clears cookies", async () => {
    const email = `auth3-${Date.now()}@test.com`;
    const password = "secret123";
    await post(t.app, "/api/signup", {
      data: { email, password, first_name: "A", last_name: "B" },
    });
    const res = await post(t.app, "/api/login", { data: { email, password } });
    const access = cookieFrom(res.cookies, "fp_access");
    const refresh = cookieFrom(res.cookies, "fp_refresh");

    const logout = await callWithCookies(
      "/api/logout",
      { data: {} },
      `fp_access=${access}; fp_refresh=${refresh}`
    );
    expect(logout.status).toBe(200);

    const profile = await callWithCookies("/api/user/get/profile", { data: {} }, `fp_access=${access}`);
    const profileBody = await profile.json();
    expect(profileBody.status).toBe("error");
    expect(profileBody.error.code).toBe(401);
    const again = await callWithCookies("/api/auth/refresh", {}, `fp_refresh=${refresh}`);
    const againBody = await again.json();
    expect(againBody.error.code).toBe(401);
  });

  it("missing fp_access falls back to the legacy session cookie (dual-mode)", async () => {
    const email = `auth4-${Date.now()}@test.com`;
    const password = "secret123";
    const res = await post(t.app, "/api/signup", {
      data: { email, password, first_name: "A", last_name: "B" },
    });
    const sessionId = cookieFrom(res.cookies, "session_id");
    const profile = await callWithCookies("/api/user/get/profile", { data: {} }, `session_id=${sessionId}`);
    expect(profile.status).toBe(200);
  });
});
