import { oauthRoute } from "@/server/mcp/oauth/next";
import { handleRegister } from "@/server/mcp/oauth/handlers";

// Dynamic client registration (RFC 7591).
export const POST = oauthRoute(handleRegister);
