import nodemailer from "nodemailer";

// Use server's built-in sendmail/Exim — no SMTP config needed
const transporter = nodemailer.createTransport({
  sendmail: true,
  newline: "unix",
  path: "/usr/sbin/sendmail",
});

const FROM = "TUAH <noreply@tuah.com>";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://tuah.com";

export async function sendPasswordResetEmail(
  to: string,
  resetToken: string
): Promise<void> {
  const resetUrl = `${SITE_URL}/auth/reset-password?token=${resetToken}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 40px;">
  <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 24px;">
      <span style="font-size: 28px; font-weight: 900; color: #047857;">TUAH</span>
      <span style="font-size: 12px; color: #6b7280; display: block;">Tournament Umpire Automation Hawkeye</span>
    </div>
    <h2 style="color: #111827; margin: 0 0 8px;">Reset Your Password</h2>
    <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
      We received a request to reset the password for your TUAH account.
      Click the button below to set a new password:
    </p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${resetUrl}"
         style="display: inline-block; background: #047857; color: white; text-decoration: none;
                padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 15px;">
        Reset My Password
      </a>
    </div>
    <p style="color: #9ca3af; font-size: 12px; line-height: 1.5;">
      This link expires in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email.
    </p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 11px; text-align: center; margin: 0;">
      TUAH &mdash; tuah.com
    </p>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: FROM,
    to,
    subject: "Reset Your TUAH Password",
    html,
    text: `Reset your TUAH password: ${resetUrl}`,
  });
}
