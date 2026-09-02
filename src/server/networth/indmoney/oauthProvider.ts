/**
 * MCP SDK OAuthClientProvider backed by the net worth repository.
 *
 * The IndMoney MCP server uses OAuth 2.1 + PKCE. This provider gives the MCP
 * SDK everything it needs to:
 *   - persist per-user OAuth tokens (NetWorth_Link_Store)
 *   - persist dynamic client registration info (same store)
 *   - persist the PKCE code verifier + authorization URL during the
 *     redirect-to-IndMoney leg (NetWorth_OAuth_State)
 */

import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import type { NetWorthRepository } from "../repository";

/**
 * The MCP SDK reads `expires_at` (epoch seconds) in its expiry/refresh logic,
 * but the published OAuthTokens type doesn't declare it. Keep it when saving.
 */
export type PersistedOAuthTokens = OAuthTokens & { expires_at?: number };

export interface IndMoneyOAuthProviderOptions {
  user_id: string;
  redirect_url: string;
  state: string;
}

/** Per-user, per-authorization OAuth client provider for the MCP SDK. */
export class IndMoneyOAuthClientProvider implements OAuthClientProvider {
  constructor(
    private repo: NetWorthRepository,
    private opts: IndMoneyOAuthProviderOptions
  ) {}

  get redirectUrl(): string {
    return this.opts.redirect_url;
  }

  get clientMetadata() {
    return {
      client_name: "fi-plan",
      client_uri: "https://fi-plan.local",
      redirect_uris: [this.opts.redirect_url],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "networth.read market.read",
    };
  }

  state(): string {
    return this.opts.state;
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const link = await this.repo.GetLink(this.opts.user_id);
    return (link?.client_info as OAuthClientInformationMixed | undefined) ?? undefined;
  }

  async saveClientInformation(clientInformation: OAuthClientInformationMixed) {
    await this.repo.UpdateLink(this.opts.user_id, { client_info: clientInformation as unknown as Record<string, any> });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const link = await this.repo.GetLink(this.opts.user_id);
    if (!link?.tokens) return undefined;
    return link.tokens as unknown as OAuthTokens;
  }

  async saveTokens(tokens: OAuthTokens) {
    // The MCP SDK decides whether to refresh based on `expires_at` (epoch
    // seconds). IndMoney only sends `expires_in`, so compute it — otherwise
    // the token is treated as never-expiring and the refresh path is never
    // taken, which later surfaces as "authorizationCode required".
    const normalized: PersistedOAuthTokens = { ...tokens };
    const expires_in = normalized.expires_in ?? 3600;
    normalized.expires_at = Math.floor(Date.now() / 1000) + expires_in;
    await this.repo.UpdateLink(this.opts.user_id, { tokens: normalized });
  }

  async redirectToAuthorization(authorizationUrl: URL) {
    await this.repo.UpdateOAuthState(this.opts.state, {
      authorization_url: authorizationUrl.toString(),
    });
  }

  async saveCodeVerifier(codeVerifier: string) {
    await this.repo.UpdateOAuthState(this.opts.state, { code_verifier: codeVerifier });
  }

  async codeVerifier(): Promise<string> {
    const stateDoc = await this.repo.GetOAuthState(this.opts.state);
    if (!stateDoc?.code_verifier) throw new UnauthorizedError("missing code verifier");
    return stateDoc.code_verifier;
  }

  async invalidateCredentials() {
    await this.repo.DeleteLink(this.opts.user_id);
    await this.repo.DeleteOAuthState(this.opts.state);
  }
}
