import { NextRequest, NextResponse } from "next/server";
import { queryOne, query } from "@/lib/db";
import { hashPassword } from "@/lib/password";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json({ error: "Token and password are required" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    // Find valid token
    const profile = await queryOne(
      "SELECT id, email FROM profiles WHERE reset_token = $1 AND reset_token_expires > NOW()",
      [token]
    );

    if (!profile) {
      return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 });
    }

    // Hash new password (salted scrypt)
    const passwordHash = hashPassword(password);

    // Update password and clear token
    await query(
      "UPDATE profiles SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2",
      [passwordHash, profile.id]
    );

    return NextResponse.json({ ok: true, message: "Password reset successfully" });
  } catch (err: any) {
    console.error("Reset password error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
