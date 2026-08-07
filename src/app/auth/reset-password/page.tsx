"use client";

export const dynamic = "force-dynamic";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">🔗</div>
        <p className="text-gray-700 font-medium">Invalid reset link</p>
        <p className="text-gray-500 text-sm mt-1">
          This link is missing the reset token. Please request a new one.
        </p>
        <Link href="/auth/forgot-password"
          className="mt-4 inline-block bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-medium text-sm hover:bg-emerald-600">
          Request Reset
        </Link>
      </div>
    );
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");

      setSuccess("Password reset successfully!");
      setTimeout(() => router.push("/auth/login"), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleReset} className="space-y-5">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
        ✅ Token verified — enter your new password
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          required minLength={6}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
          placeholder="At least 6 characters" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
          placeholder="Repeat password" />
      </div>

      {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 px-4 py-3 rounded-xl text-sm">{success}</div>}

      <button type="submit" disabled={loading}
        className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all">
        {loading ? "Resetting..." : "Reset Password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-green-700 flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
        <Link href="/auth/login" className="text-emerald-600 text-sm hover:underline">← Back to Login</Link>
        <h1 className="text-3xl font-black text-gray-900 mt-4 mb-2">Set New Password</h1>
        <p className="text-gray-500 mb-8">Enter a new password for your account.</p>

        <Suspense fallback={<div className="text-center py-8 text-gray-400 animate-pulse">Loading...</div>}>
          <ResetPasswordForm />
        </Suspense>

        <p className="text-center text-sm text-gray-500 mt-6">
          Remember your password?{" "}
          <Link href="/auth/login" className="text-emerald-700 font-semibold hover:underline">Sign In</Link>
        </p>
      </div>
    </div>
  );
}
