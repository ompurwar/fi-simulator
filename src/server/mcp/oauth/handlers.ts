/** OAuth 2.1 MCP authorization-server handlers — framework-agnostic (Next.js route wrapper injects the container). */

import { NextRequest, NextResponse } from "next/server";
import type { Container } from "../../di/container";

/** Resolve the session cookie (value.sig) to a user_id, or null. */
async function sessionUser(container: Container, req: NextRequest): Promise<string | null> {
  const signed = req.cookies.get("session_id")?.value;
  if (!signed) return null;
  const session_id = container.VerifyCookie(signed, container.cookieSecret);
  if (!session_id) return null;
  const session = await container.session_list.FindByActiveSessionId(session_id as any);
  return session ? session.user_id : null;
}

function metadata(container: Container, origin: string) {
  const base = `${origin}/api/mcp/oauth`;
  return NextResponse.json({
    issuer: origin,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    revocation_endpoint: `${base}/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["fiplan"],
  });
}

export async function oauthGet(req: NextRequest, container: Container): Promise<NextResponse> {
  const segments = req.nextUrl.pathname.split("/").filter(Boolean);
  // /api/mcp/.well-known/oauth-authorization-server
  if (segments[2] === ".well-known" && segments[3] === "oauth-authorization-server") {
    return metadata(container, req.nextUrl.origin);
  }
  // /api/mcp/oauth/authorize
  if (segments[2] === "oauth" && segments[3] === "authorize") {
    const sp = req.nextUrl.searchParams;
    try {
      const { oauth_id } = await container.oauth_service.startAuthorization({
        client_id: sp.get("client_id") || "",
        redirect_uri: sp.get("redirect_uri") || "",
        code_challenge: sp.get("code_challenge") || "",
        code_challenge_method: sp.get("code_challenge_method") || "S256",
        state: sp.get("state") || undefined,
      });
      const user_id = await sessionUser(container, req);
      if (user_id) {
        // Already signed in — complete the flow immediately (IndMoney-style).
        const { code, redirect_uri, state } = await container.oauth_service.issueCode({ oauth_id, user_id });
        const url = new URL(redirect_uri);
        url.searchParams.set("code", code);
        if (state) url.searchParams.set("state", state);
        return NextResponse.redirect(url.toString(), 302);
      }
      return NextResponse.redirect(`${req.nextUrl.origin}/login?oauth=${oauth_id}`, 302);
    } catch (e: any) {
      const url = new URL(req.nextUrl.searchParams.get("redirect_uri") || `${req.nextUrl.origin}/login`);
      url.searchParams.set("error", "invalid_request");
      url.searchParams.set("error_description", e?.message || "authorization failed");
      return NextResponse.redirect(url.toString(), 302);
    }
  }
  return new NextResponse(null, { status: 404 });
}

export async function oauthPost(req: NextRequest, container: Container): Promise<NextResponse> {
  const segments = req.nextUrl.pathname.split("/").filter(Boolean);
  const isOauth = segments[2] === "oauth";

  if (isOauth && segments[3] === "register") {
    try {
      const body = await req.json().catch(() => ({}));
      const client = await container.oauth_service.registerClient({
        client_name: body.client_name || "mcp-client",
        redirect_uris: Array.isArray(body.redirect_uris) ? body.redirect_uris : [],
      });
      return NextResponse.json({
        client_id: client.client_id,
        client_name: client.client_name,
        redirect_uris: client.redirect_uris,
        token_endpoint_auth_method: client.token_endpoint_auth_method,
        grant_types: ["authorization_code", "refresh_token"],
      });
    } catch (e: any) {
      return NextResponse.json({ error: "invalid_client_metadata", error_description: e?.message }, { status: 400 });
    }
  }

  if (isOauth && segments[3] === "authorize") {
    const user_id = await sessionUser(container, req);
    if (!user_id) {
      return NextResponse.json({ error: "unauthorized", error_description: "no active session" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    try {
      const { code, redirect_uri, state } = await container.oauth_service.issueCode({
        oauth_id: body.oauth_id,
        user_id,
      });
      const url = new URL(redirect_uri);
      url.searchParams.set("code", code);
      if (state) url.searchParams.set("state", state);
      return NextResponse.redirect(url.toString(), 302);
    } catch (e: any) {
      return NextResponse.json({ error: "invalid_request", error_description: e?.message }, { status: 400 });
    }
  }

  if (isOauth && segments[3] === "token") {
    const isForm = (req.headers.get("content-type") || "").includes("application/x-www-form-urlencoded");
    const raw = await req.text();
    const params = isForm
      ? new URLSearchParams(raw)
      : new URLSearchParams(Object.entries((await req.json().catch(() => ({}))) as Record<string, string>));
    const grant_type = params.get("grant_type");
    const client_id = params.get("client_id") || "";
    try {
      if (grant_type === "authorization_code") {
        const tokens = await container.oauth_service.exchangeCode({
          client_id,
          code: params.get("code") || "",
          code_verifier: params.get("code_verifier") || undefined,
          redirect_uri: params.get("redirect_uri") || undefined,
        });
        return NextResponse.json(tokens);
      }
      if (grant_type === "refresh_token") {
        const tokens = await container.oauth_service.exchangeRefresh({
          client_id,
          refresh_token: params.get("refresh_token") || "",
        });
        return NextResponse.json(tokens);
      }
      return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
    } catch (e: any) {
      const msg = e?.message || "token exchange failed";
      return NextResponse.json({ error: "invalid_grant", error_description: msg }, { status: 400 });
    }
  }

  if (isOauth && segments[3] === "revoke") {
    const body = await req.json().catch(() => ({}));
    await container.oauth_service.revoke({ token: body.token || "" });
    return NextResponse.json({});
  }

  return new NextResponse(null, { status: 404 });
}
