/**
 * Net worth provider port.
 *
 * Every provider (IndMoney today, others tomorrow) implements this interface.
 * The service layer depends only on this interface — never on a concrete
 * provider — so a provider can be swapped without touching business logic.
 */

import type { ProviderSnapshotPayload } from "./types";

export interface ProviderAuthorization {
  /** Opaque state token bound to the pending authorization (CSRF protection). */
  state: string;
  /** URL the user agent must be redirected to in order to authorize. */
  url: string;
}

export interface NetWorthProvider {
  readonly name: string;

  /**
   * Begins the OAuth authorization flow for a user. The state token is
   * generated and persisted by the service; the provider embeds it in the
   * authorization request and echoes it back on the callback. Returns the
   * URL the user agent must be redirected to.
   */
  buildAuthorizationUrl(input: {
    user_id: string;
    redirect_url: string;
    state: string;
  }): Promise<ProviderAuthorization>;

  /**
   * Completes authorization after the user has approved on the provider's
   * consent screen and the browser landed on our callback with `code`.
   */
  finishAuthorization(input: { state: string; code: string }): Promise<void>;

  /** Pulls the user's current net worth snapshot + holdings from the provider. */
  fetchSnapshot(input: { user_id: string }): Promise<ProviderSnapshotPayload>;

  /** Revokes/drops the provider link for a user. */
  disconnect(input: { user_id: string }): Promise<void>;
}
