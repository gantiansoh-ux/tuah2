"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"email" | "done">("email");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) { setError("Please enter your email"); return; }
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setStep("done");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-green-700 flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
        <Link href="/auth/login" className="text-emerald-600 text-sm hover:underline">← Back to Login</Link>
        <h1 className="text-3xl font-black text-gray-900 mt-4 mb-2">
          Reset Password
        </h1>
        <p className="text-gray-500 mb-8">
          {step === "email" && "Enter your email to reset your password."}
          {step === "done" && "Check your email for the reset link."}
        </p>

        {step === "email" && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="you@email.com"
              />
            </div>
            {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full bg-emerald-700 text-white font-bold py-3 rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-all"
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        )}

        {step === "done" && (
          <div className="space-y-5">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
              <div className="text-4xl mb-2">📧</div>
              <p className="text-blue-800 font-medium">Check your email</p>
              <p className="text-blue-600 text-sm mt-1">
                If an account with this email exists, we&apos;ve sent a password reset link.
              </p>
              <p className="text-blue-500 text-xs mt-3">
                Didn&apos;t receive it? Check your spam folder or try again in a few minutes.
              </p>
            </div>
            <button onClick={() => { setStep("email"); setEmail(""); setError(""); }}
              className="w-full py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
            >
              Try a different email
            </button>
          </div>
        )}

        <p className="text-center text-sm text-gray-500 mt-6">
          Remember your password?{" "}
          <Link href="/auth/login" className="text-emerald-700 font-semibold hover:underline">Sign In</Link>
        </p>
      </div>
    </div>
  );
}
