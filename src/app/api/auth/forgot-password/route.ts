import { NextRequest, NextResponse } from "next/server";
import { queryOne, query } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/mail";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const profile = await queryOne(
      "SELECT id, email FROM profiles WHERE email = $1",
      [email]
    );

    let sent = false;
    if (profile) {
      // Generate reset token, valid for 1 hour
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 3600000);
      await query(
        "UPDATE profiles SET reset_token = $1, reset_token_expires = $2 WHERE id = $3",
        [token, expires.toISOString(), profile.id]
      );

      // Send actual email
      try {
        await sendPasswordResetEmail(profile.email, token);
        sent = true;
      } catch (mailErr) {
        console.error("Failed to send reset email:", mailErr);
        // Still return success to the user, but log the error
      }
    }

    // Always return the same generic message and NO delivery flag,
    // so an attacker cannot tell whether an email is registered.
    return NextResponse.json({
      ok: true,
      message: "If this email is registered, a reset link has been sent to your email.",
    });
  } catch (err: any) {
    console.error("Forgot password error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
