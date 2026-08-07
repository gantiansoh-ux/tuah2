import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createToken, setCookieHeader } from "@/lib/auth";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  try {
    const { email, password, fullName, role } = await req.json();

    // Validate required + email format
    if (!email || !email.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!EMAIL_RE.test(email.trim())) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }
    if (!password || !password.trim()) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    // Rate limit registration per IP to prevent mass account/email enumeration
    const ip = clientIp(req);
    const rl = checkRateLimit(`register:${ip}`, 10, 15 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many registration attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      );
    }

    // Check if user already exists
    const existing = await query("SELECT id FROM profiles WHERE LOWER(email) = LOWER($1)", [email.trim()]);
    if (existing.rows.length > 0) {
      // Generic message: don't reveal whether the email is registered
      // (enumeration hardening). 409 keeps the client flow intact.
      return NextResponse.json({ error: "Unable to register with this email" }, { status: 409 });
    }

    const passwordHash = hashPassword(password);

    const result = await query(
      `INSERT INTO profiles (email, full_name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, role`,
      [email.trim(), fullName, passwordHash, role || "organizer"]
    );

    const profile = result.rows[0];

    // Auto-login: sign a token and set the auth cookie immediately so the
    // post-registration redirect lands on an authenticated session (P1 fix,
    // Gan 2026-08-03). Mirrors /api/auth/login behaviour.
    const token = await createToken({
      userId: profile.id,
      email: profile.email,
      role: profile.role,
    });
    const response = NextResponse.json({
      user: { id: profile.id, email: profile.email, name: profile.full_name, role: profile.role },
    }, { status: 201 });
    response.headers.set("Set-Cookie", setCookieHeader(token));
    return response;
  } catch (err: any) {
    console.error("Register error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
