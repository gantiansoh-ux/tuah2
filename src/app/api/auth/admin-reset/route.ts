import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { queryOne, query } from "@/lib/db";
import crypto from "crypto";

// POST /api/auth/admin-reset
// Admin-only: generates a reset token for any user (dev tool)
export async function POST(req: NextRequest) {
  // SEC-3A1 admin-reset (2026-08-11): hard-disabled in production (404),
  // regardless of auth state — this dev-only helper must not exist on the
  // live site.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload || payload.role !== "admin") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const profile = await queryOne(
      "SELECT id, email FROM profiles WHERE email = $1",
      [email]
    );
    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Generate reset token
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000); // 1 hour
    await query(
      "UPDATE profiles SET reset_token = $1, reset_token_expires = $2 WHERE id = $3",
      [token, expires.toISOString(), profile.id]
    );

    // SEC-3A1 admin-reset (2026-08-11): never return the reset token or the
    // reset URL in the response body.
    return NextResponse.json({ ok: true, email: profile.email });
  } catch (err: any) {
    console.error("Admin reset error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
