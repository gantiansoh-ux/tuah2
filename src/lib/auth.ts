import { SignJWT, jwtVerify } from "jose";

// SEC-3A1-01 (2026-08-11): JWT_SECRET must come from the environment.
// The previous hardcoded fallback key shipped verbatim in the production
// bundle, letting anyone forge admin JWTs. There is no fallback branch
// anymore: if the secret is missing (or shorter than 32 chars) we refuse to
// start/sign — fail fast instead of silently signing with a known key.
const rawSecret = process.env.JWT_SECRET;
if (!rawSecret || rawSecret.length < 32) {
  throw new Error(
    "FATAL: JWT_SECRET is not set (or shorter than 32 chars). " +
      "Refusing to start/sign tokens — SEC-3A1-01. Set JWT_SECRET via the " +
      "process environment (e.g. ecosystem.config.js env / .env.local)."
  );
}
const JWT_SECRET = new TextEncoder().encode(rawSecret);

const COOKIE_NAME = "tuah_token";

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

export async function createToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export function getCookieName(): string {
  return COOKIE_NAME;
}

export function setCookieHeader(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`;
}

export function clearCookieHeader(): string {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}
