/** OAuth 2.1 MCP authorization-server module (barrel). */

export { makeOAuthStore, type OAuthStore } from "./repository";
export { makeOAuthService, type OAuthService, type OAuthServiceDeps } from "./service";
export {
  OAUTH_SCOPES,
  OAUTH_ACCESS_TTL_MS,
  OAUTH_REFRESH_TTL_MS,
  type OAuthClient,
  type OAuthTokens,
} from "./types";
