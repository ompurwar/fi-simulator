import { oauthRoute } from "@/server/mcp/oauth/next";
import { handleAuthorizeGet, handleAuthorizePost } from "@/server/mcp/oauth/handlers";

// Authorization endpoint: GET starts the flow (→ /login?oauth= or immediate
// code when already signed in); POST continues it with a valid session cookie.
export const GET = oauthRoute(handleAuthorizeGet);
export const POST = oauthRoute(handleAuthorizePost);
