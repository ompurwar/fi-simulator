import { oauthRoute } from "@/server/mcp/oauth/next";
import { handleToken } from "@/server/mcp/oauth/handlers";

// Token endpoint (RFC 6749) — authorization_code / refresh_token with PKCE S256.
export const POST = oauthRoute(handleToken);
