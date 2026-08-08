import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { createToken, setCookieHeader, getCookieName } from "@/lib/auth";
import { verifyPassword, isLegacyHash, hashPassword } from "@/lib/password";
import { checkRateLimit, clearRateLimit, clientIp } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const tStart = Date.now();
  try {
    const { email, password } = await req.json();
    const emailKey = (email || "").trim().toLowerCase();

    // [auth-diag] temporary instrumentation (2026-08-08, login 401 investigation)
    const diag = (status: number, note: string, extra: Record<string, unknown> = {}) => {
      console.log(
        `[auth-diag] ${status} email=${emailKey} note=${note} ms=${Date.now() - tStart} ` +
        `ct=${req.headers.get("content-type") || "-"} cookie=${req.cookies.get(getCookieName()) ? 1 : 0} ` +
        JSON.stringify(extra)
      );
    };

    // Guard against empty credentials (empty-email account existed in DB)
    if (!email || !email.trim() || !password || !password.trim()) {
      diag(401, "empty");
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Rate limit (SECURITY fix 2026-08-07): key on EMAIL first so spoofed
    // X-Forwarded-For can't bypass the per-account lockout (verified exploitable
    // before fix). IP is a secondary bucket only when it is a real proxy-set IP.
    const ip = clientIp(req);
    const rlKey = ip === 'unknown' ? `login:${emailKey}` : `login:${ip}:${emailKey}`;
    const rl = checkRateLimit(rlKey, 5, 15 * 60 * 1000);
    if (!rl.ok) {
      diag(429, "ratelimit", { retryAfter: rl.retryAfterSec, ip });
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      );
    }

    const tDb = Date.now();
    const profile = await queryOne(
      "SELECT id, email, full_name, role, password_hash FROM profiles WHERE LOWER(email) = LOWER($1)",
      [email.trim()]
    );
    const dbMs = Date.now() - tDb;

    if (!profile) {
      diag(401, "no-profile", { dbMs, ip });
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Verify password (supports scrypt + legacy SHA-256)
    const tV = Date.now();
    const ok = verifyPassword(password, profile.password_hash);
    const vMs = Date.now() - tV;
    if (!ok) {
      diag(401, "bad-pw", { dbMs, vMs, ip });
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    diag(200, "ok", { dbMs, vMs, ip });

    // Success: clear rate limit, upgrade legacy hash to scrypt if needed
    clearRateLimit(rlKey);
    if (isLegacyHash(profile.password_hash)) {
      try {
        await query("UPDATE profiles SET password_hash = $1 WHERE id = $2", [
          hashPassword(password),
          profile.id,
        ]);
      } catch (upErr) {
        console.error("Password hash upgrade failed:", upErr);
        // Non-fatal: continue with login
      }
    }

    const token = await createToken({
      userId: profile.id,
      email: profile.email,
      role: profile.role,
    });

    const response = NextResponse.json({
      user: { id: profile.id, email: profile.email, name: profile.full_name, role: profile.role },
    });

    response.headers.set("Set-Cookie", setCookieHeader(token));
    return response;
  } catch (err: any) {
    console.error("[auth-diag] 500 exception ms=" + (Date.now() - tStart), err);
    console.error("Login error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
