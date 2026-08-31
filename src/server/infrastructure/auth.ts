import type { SessionRepository } from "../domain/ports";
import { InvalidAuthTokenError } from "../domain/errors";

/** Paths that don't require a session (whitelisted, matching the original). */
const UNAUTHENTICATED_PATHS = [
  "login",
  "signup",
  "get/share_object",
  "password_reset_session/create",
  "reset_forgotten_password",
  "auth/refresh",
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

/** Port of src/service/authenticate.service.js — resolves the user session.
 *  Accepts the JWT access token (fp_access cookie / Bearer / eyJ auth-token)
 *  first, then falls back to the legacy session_id cookie/header. */
export async function Authenticate(
  http_request: AuthRequest,
  session_repo: SessionRepository,
  verifyCookie: (value: string, secret: string) => string | false,
  cookieSecret: string,
  verifyAccessToken?: (token: string) => Promise<{ user_id: string }>
): Promise<{ user_id: string; session_id: string }> {
  let is_whitelisted = false;
  const normalized = http_request.path.replace(/\/+$/, "");
  UNAUTHENTICATED_PATHS.forEach((path) => {
    if (normalized === path || normalized === `/${path}`) is_whitelisted = true;
  });
  if (is_whitelisted) {
    return { user_id: "", session_id: "" };
  }

  // 1) JWT access token — fp_access cookie (signed like every other cookie).
  if (verifyAccessToken) {
    const accessSigned = http_request.cookies["fp_access"];
    if (accessSigned) {
      const raw = verifyCookie(accessSigned, cookieSecret);
      if (raw) {
        try {
          const { user_id } = await verifyAccessToken(raw);
          return { user_id, session_id: "" };
        } catch {
          /* fall through to legacy — rollout dual-mode */
        }
      }
    }
    // 2) JWT in Authorization: Bearer or a JWT-shaped auth-token header.
    const bearer =
      (http_request.headers["authorization"] || "").replace(/^Bearer\s+/i, "") ||
      http_request.headers["auth-token"] ||
      "";
    if (bearer.startsWith("eyJ")) {
      try {
        const { user_id } = await verifyAccessToken(bearer);
        return { user_id, session_id: "" };
      } catch {
        /* fall through to legacy */
      }
    }
  }

  // 3) Legacy session — session_id cookie or auth-token header.
  let session_id: string | undefined = http_request.headers["auth-token"];
  if (session_id && session_id.startsWith("eyJ")) session_id = undefined;
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
