import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { queryOne, query } from "@/lib/db";
import crypto from "crypto";

// POST /api/auth/admin-reset
// Admin-only: generates a reset token for any user in debug mode
export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload || (payload.role !== "admin" && payload.role !== "organizer")) {
    return NextResponse.json({ error: "Forbidden — admin/organizer only" }, { status: 403 });
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

    // Build a magic reset URL
    const resetUrl = `${req.nextUrl.protocol}//${req.nextUrl.host}/auth/reset-password?token=${token}`;

    return NextResponse.json({
      ok: true,
      email: profile.email,
      token,
      reset_url: resetUrl,
      expires: expires.toISOString(),
      note: "This endpoint is for dev/admin use only. Remove before production.",
    });
  } catch (err: any) {
    console.error("Admin reset error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
