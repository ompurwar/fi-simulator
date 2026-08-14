import type { SessionRepository } from "../domain/ports";
import { InvalidAuthTokenError } from "../domain/errors";

/** Paths that don't require a session (whitelisted, matching the original). */
const UNAUTHENTICATED_PATHS = [
  "login",
  "signup",
  "get/share_object",
  "password_reset_session/create",
  "reset_forgotten_password",
];

export interface AuthRequest {
  path: string;
  headers: Record<string, string | undefined>;
  cookies: Record<string, string>;
  body: any;
  query: Record<string, string | undefined>;
}

export interface AuthenticatedRequest extends AuthRequest {
  session: { user_id: string; session_id: string };
}

/** Port of src/service/authenticate.service.js — resolves the user session. */
export async function Authenticate(
  http_request: AuthRequest,
  session_repo: SessionRepository,
  verifyCookie: (value: string, secret: string) => string | false,
  cookieSecret: string
): Promise<{ user_id: string; session_id: string }> {
  let is_whitelisted = false;
  const normalized = http_request.path.replace(/\/+$/, "");
  UNAUTHENTICATED_PATHS.forEach((path) => {
    if (normalized === path || normalized === `/${path}`) is_whitelisted = true;
  });
  if (is_whitelisted) {
    return { user_id: "", session_id: "" };
  }

  let session_id: string | undefined = http_request.headers["auth-token"];
  const signedCookie = http_request.cookies["session_id"];
  if (signedCookie) {
    const verified = verifyCookie(signedCookie, cookieSecret);
    if (verified) session_id = verified;
  }

  if (!session_id) throw new InvalidAuthTokenError();

  const session = await session_repo.FindByActiveSessionId(session_id as any);
  if (!session) throw new InvalidAuthTokenError();

  return { user_id: session.user_id, session_id: session.session_id };
}
