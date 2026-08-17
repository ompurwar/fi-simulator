import type { Container } from "../di/container";
import type { HttpResponse, HttpRequest } from "../presentation/controllers";
import { MakeControllers, type Controllers } from "../presentation/controllers";
import { Authenticate } from "../infrastructure/auth";
import { FiPlanError } from "../domain/errors";

function GetErrorMessage(error: any): string {
  let message = error.message ? error.message : "";
  if (error.code === 500 || !error.code) {
    message = "An unknown error occurred.";
  }
  return message;
}

/** Build a Web Fetch API request handler from the container. */
export function buildApp(container: Container): (req: Request) => Promise<Response> {
  const controllers = MakeControllers(container.app);

  async function dispatch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    // strip the /api prefix (Next.js mounts under /api; standalone mounts at root)
    const path = url.pathname.replace(/^\/api/, "") || "/";
    const method = req.method.toUpperCase();

    // health
    if (path === "/alive" && method === "GET")
      return new Response("I AM AlIVE!!");
    if (path === "/" && method === "GET") return new Response("success");

    let body: any = {};
    const contentType = req.headers.get("content-type") || "";
    if (method !== "GET" && contentType.includes("application/json")) {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }

    // cookies
    const cookies: Record<string, string> = {};
    const cookieHeader = req.headers.get("cookie") || "";
    cookieHeader.split(";").forEach((pair) => {
      const idx = pair.indexOf("=");
      if (idx > -1) cookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    });

    const headers: Record<string, string | undefined> = {};
    req.headers.forEach((v, k) => (headers[k] = v));
    const auth_token = headers["auth-token"] || headers["authtoken"];

    const http_request: HttpRequest = {
      body,
      query: Object.fromEntries(url.searchParams.entries()),
      params: {},
      ip: headers["x-forwarded-for"]?.split(",")[0]?.trim(),
      method,
      path,
      headers: {
        ...headers,
        "auth-token": auth_token,
      },
      cookies,
    };

    // route + method gate — rejects wrong-method requests (e.g. Next.js
    // prefetch GETs hitting POST-only /api/engine/*) before auth runs, so they
    // never dispatch into controllers that crash on a missing body.
    const normalized = path.replace(/\/+$/, "");
    const route = FindRoute(path);
    if (!route) return new Response("not found", { status: 404 });
    if (method !== "POST" && !GET_ROUTES.has(normalized)) {
      return new Response(
        JSON.stringify({ error: { msg: "method not allowed" }, status: "error", data: null }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }

    // Authenticate (whitelisted paths return empty session)
    try {
      const session = await Authenticate(
        http_request,
        container.session_list,
        container.VerifyCookie,
        container.cookieSecret
      );
      http_request.session = session;
    } catch (e: any) {
      return RespondError(new FiPlanError("invalid auth token", 401));
    }

    // route dispatch
    try {
      const controller = controllers[route.controller] as (
        r: HttpRequest
      ) => Promise<HttpResponse>;
      const http_response = await controller(http_request);
      return ToFetchResponse(http_response, container);
    } catch (e: any) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[fi-plan] route error:", e?.stack || e);
      }
      return RespondError(e);
    }
  }

  return dispatch;
}

type ControllerName = keyof Controllers;

// Routes that legitimately answer GETs (health + public share lookups).
const GET_ROUTES = new Set(["/alive", "/", "/get/share_object", "/get/share_object_details"]);

function FindRoute(path: string): { controller: ControllerName } | null {
  const normalized = path.replace(/\/+$/, "");
  const map: Record<string, string> = {
    "/login": "Login",
    "/signup": "Signup",
    "/logout": "Logout",
    "/check/session": "IsLoggedIn",
    "/password/update": "UpdatePassword",
    "/password_reset_session/create": "InitiateResetPasswordSession",
    "/reset_forgotten_password": "ResetForgottenPassword",
    "/user/get/profile": "GetUser",
    "/user/onboard": "OnboardUser",
    "/user/set_default_plan": "SetDefaultPlan",
    "/plan/add": "AddPlan",
    "/get/plan": "GetPlan",
    "/plan/update": "UpdatePlan",
    "/plan/delete": "DeletePlan",
    "/plan/fork": "ForkPlan",
    "/income/add": "AddIncome",
    "/get/income": "GetIncome",
    "/income/update": "UpdateIncome",
    "/income/delete": "DeleteIncome",
    "/expense/add": "AddExpense",
    "/get/expense": "GetExpense",
    "/expense/update": "UpdateExpense",
    "/expense/delete": "DeleteExpense",
    "/cashflow_changes/add": "AddCashflowChange",
    "/get/cashflow_changes": "GetCashflowChanges",
    "/cashflow_changes/update": "UpdateCashflowChange",
    "/cashflow_changes/delete": "DeleteCashflowChange",
    "/share_object/create": "AddShareObject",
    "/get/share_object": "GetShareObject",
    "/get/share_object_details": "GetShareObject",
    "/share_object/update": "UpdateShareObject",
    "/share_object/optin": "OptinShareObject",
    "/share_object/delete": "DeleteShareObject",
    "/get/common_collection": "GetCommonCollection",
    "/api_token/create": "ApiTokenCreate",
    "/api_token/list": "ApiTokenList",
    "/api_token/revoke": "ApiTokenRevoke",
    "/chat_session/create": "ChatSessionCreate",
    "/chat_session/list": "ChatSessionList",
    "/chat_session/get": "ChatSessionGet",
    "/chat_session/delete": "ChatSessionDelete",
    "/engine/plan_snapshot": "PlanSnapshot",
    "/networth/status": "GetNetWorthStatus",
    "/networth/connect": "ConnectNetWorth",
    "/networth/sync": "SyncNetWorth",
    "/networth/disconnect": "DisconnectNetWorth",
  };
  const controller = map[normalized] as ControllerName | undefined;
  return controller ? { controller } : null;
}

/** Convert the framework-agnostic response into a Web Fetch Response. */
function ToFetchResponse(http_response: HttpResponse, container: Container): Response {
  const init: ResponseInit = { status: http_response.status_code || 200 };
  const response_headers = new Headers(http_response.headers || {});
  response_headers.set("Content-Type", "application/json");

  if (http_response.cookies) {
    const parts: string[] = [];
    for (const key in http_response.cookies) {
      if (!Object.prototype.hasOwnProperty.call(http_response.cookies, key)) continue;
      const value = http_response.cookies[key];
      const signed = container.UnsafeSign(value, container.cookieSecret);
      parts.push(
        `${key}=${signed}; Max-Age=86400; Path=/; SameSite=None; Secure`
      );
    }
    if (parts.length) response_headers.set("Set-Cookie", parts.join(", "));
  }

  init.headers = response_headers;
  return new Response(JSON.stringify(http_response.body), init);
}

/** Port of the express adapter error handler — coded errors return HTTP 200. */
function RespondError(e: any): Response {
  const status = e && e.code ? 200 : 500;
  const body = {
    error: {
      msg: GetErrorMessage(e),
      code: e && e.code ? e.code : 500,
    },
    status: "error",
    data: null,
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
