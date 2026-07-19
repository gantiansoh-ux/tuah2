"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import type { UserRole } from "@/lib/types";

const ROLES: { value: UserRole; label: string; emoji: string }[] = [
  { value: "organizer", label: "Organizer", emoji: "🏆" },
  { value: "player", label: "Player", emoji: "🏸" },
  { value: "umpire", label: "Umpire", emoji: "🎯" },
  { value: "coach", label: "Coach", emoji: "📋" },
  { value: "court_owner", label: "Court Owner", emoji: "🏟️" },
];

export default function RegisterPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>(["organizer"]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const supabase = createClient();

  function toggleRole(role: UserRole) {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (selectedRoles.length === 0) {
      setError("Select at least one role");
      return;
    }
    setError("");
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      // Create profile in profiles table
      const { error: profileError } = await supabase.from("profiles").insert({
        id: data.user.id,
        email,
        full_name: fullName,
        roles: selectedRoles,
      });
      if (profileError) console.error("Profile insert error:", profileError);
    }

    setLoading(false);
    router.push("/organizer");
    router.refresh();
  }

  if (step === 1) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-green-700 flex items-center justify-center px-4 py-8">
        <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
          <Link href="/" className="text-emerald-600 text-sm hover:underline">← Home</Link>
          <h1 className="text-3xl font-black text-gray-900 mt-4 mb-2">Create Account</h1>
          <p className="text-gray-500 mb-8">Fill in your details to get started</p>

          <form onSubmit={(e) => { e.preventDefault(); setStep(2); }} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="Your full name"
              />
            </div>
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="At least 6 characters"
              />
            </div>
            <button type="submit" className="w-full bg-emerald-700 text-white font-bold py-3 rounded-xl hover:bg-emerald-600 transition-all">
              Next: Select Role →
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already registered?{" "}
            <Link href="/auth/login" className="text-emerald-700 font-semibold hover:underline">Sign In</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-green-700 flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
        <button onClick={() => setStep(1)} className="text-emerald-600 text-sm hover:underline">← Back</button>
        <h1 className="text-3xl font-black text-gray-900 mt-4 mb-2">Your Roles</h1>
        <p className="text-gray-500 mb-8">Select what you want to do on TUAH (you can pick multiple)</p>

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {ROLES.map((role) => (
              <button
                key={role.value}
                type="button"
                onClick={() => toggleRole(role.value)}
                className={`p-4 rounded-2xl border-2 text-center transition-all ${
                  selectedRoles.includes(role.value)
                    ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                    : "border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200"
                }`}
              >
                <div className="text-2xl mb-1">{role.emoji}</div>
                <div className="text-sm font-semibold">{role.label}</div>
              </button>
            ))}
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || selectedRoles.length === 0}
            className="w-full bg-emerald-700 text-white font-bold py-3 rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-all"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
