import { createHmac, randomBytes } from "crypto";
import { GenerateRandomString } from "../domain/entities";

/** Password hashing: HMAC-SHA256(salt, password) hex — matches the original GenerateHash. */
export function GenerateHash(pass: string, salt: string): string {
  return createHmac("sha256", salt).update(pass).digest("hex");
}

/** Create a {salt, hash} credential pair from a plaintext password. */
export function CreateCredentials(password: string): { salt: string; hash: string } {
  const salt = GenerateRandomString(10);
  return { salt, hash: GenerateHash(password, salt) };
}

export { GenerateRandomString };

/** Sign a value with HMAC-SHA256 (used for the session_id cookie), matching cookie-parser's default. */
export function SignCookie(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64").replace(/=+$/, "");
}

export function UnsafeSign(value: string, secret: string): string {
  return `${value}.${SignCookie(value, secret)}`;
}

export function VerifyCookie(signedValue: string, secret: string): string | false {
  const parts = signedValue.split(".");
  if (parts.length < 2) return false;
  const value = parts.slice(0, -1).join(".");
  const sig = parts[parts.length - 1];
  const expected = SignCookie(value, secret);
  // constant-time-ish compare
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? value : false;
}

/** Generate a random URL-safe token. */
export function GenerateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}
