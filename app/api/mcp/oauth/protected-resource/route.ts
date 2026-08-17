import { oauthRoute } from "@/server/mcp/oauth/next";
import { handleProtectedResource } from "@/server/mcp/oauth/handlers";

// Protected-resource metadata (RFC 9728) — Claude Code discovers OAuth via
// /.well-known/oauth-protected-resource before /.well-known/oauth-authorization-server;
// both are rewritten here from the origin-relative paths in next.config.ts.
export const GET = oauthRoute(handleProtectedResource);
