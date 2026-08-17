import { oauthRoute } from "@/server/mcp/oauth/next";
import { handleMetadata } from "@/server/mcp/oauth/handlers";

// Metadata endpoint (RFC 8414). MCP clients discover it at
// {mcp-url}/.well-known/oauth-authorization-server; next.config.ts rewrites
// that path here (.well-known folders are ignored by the App Router).
export const GET = oauthRoute(handleMetadata);
