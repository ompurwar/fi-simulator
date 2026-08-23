import { oauthRoute } from "@/server/mcp/oauth/next";
import { handleRevoke } from "@/server/mcp/oauth/handlers";

// Token revocation (RFC 7009).
export const POST = oauthRoute(handleRevoke);
