/** MCP auth helpers — API-token resolution, role resolution, AuthInfo synthesis. */

import type { Container } from "../di/container";
import { GenerateHash } from "../infrastructure/crypto";
import { InvalidPropertyError } from "../domain/errors";
import type { AuthInfo, ToolContext } from "./types";

/** Synthesize the AuthInfo carrier the SDK hands to tool handlers via extra.authInfo.extra.user_id. */
export function makeAuthInfo(user_id: string): AuthInfo {
  return { token: "", clientId: "fi-plan", scopes: ["fiplan"], extra: { user_id } };
}

/** Resolve a user_id to a tool context with the user's role (default "user"). */
export async function resolveToolContext(
  container: Container,
  user_id: string
): Promise<ToolContext> {
  const user = await container.user_list.FindById(user_id);
  return { user_id, role: user?.role ?? "user" };
}

/** Resolve a raw bearer token to a { user_id, role } tool context via the API-token store. */
export async function resolveApiToken(container: Container, rawToken: string): Promise<ToolContext> {
  const token_hash = GenerateHash(rawToken, container.cookieSecret);
  const token = await container.api_token_list.FindByTokenHash(token_hash);
  if (!token || token.status !== "active") {
    throw new InvalidPropertyError("invalid or inactive api token");
  }
  return resolveToolContext(container, token.user_id);
}
