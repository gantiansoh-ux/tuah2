"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function UmpireProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [certification, setCertification] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [experienceYears, setExperienceYears] = useState(0);
  const [rate, setRate] = useState("");
  const [bio, setBio] = useState("");
  const [languages, setLanguages] = useState("");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);

  useEffect(() => {
    if (!authLoading && !user) router.push("/auth/login");
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetch("/api/umpires/profile", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          const up = data.profile?.umpire_profile;
          if (up) {
            setCertification(up.certification || "");
            setLicenseNumber(up.license_number || "");
            setExperienceYears(Number(up.experience_years) || 0);
            setBio(up.bio || "");
            setLanguages(Array.isArray(up.languages) ? up.languages.join(", ") : up.languages || "");
            const av = up.availability && typeof up.availability === "object" ? up.availability : {};
            setRate(av.rate != null ? String(av.rate) : "");
            setSelectedDays(Array.isArray(av.days) ? av.days : []);
          }
        }
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    })();
  }, [user]);

  function toggleDay(d: string) {
    setSelectedDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const res = await fetch("/api/umpires/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          certification,
          license_number: licenseNumber,
          experience_years: experienceYears,
          bio,
          languages: languages.split(",").map((s) => s.trim()).filter(Boolean),
          availability: {
            rate: rate ? parseFloat(rate) : null,
            days: selectedDays,
          },
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const err = await res.json();
        setError(err.error || "Failed to save");
      }
    } catch {
      setError("Network error");
    }
    setSaving(false);
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!user) return null;

  const inputCls = "w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none";

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-emerald-900 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">🦉</span>
          <span className="font-bold">Umpire Profile</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/umpire" className="text-sm text-emerald-200 hover:text-emerald-100">← Dashboard</Link>
          <Link href="/" className="text-sm text-emerald-200 hover:text-emerald-100">Home</Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-black text-gray-900 mb-1">My Profile & Availability</h1>
        <p className="text-gray-500 text-sm mb-8">Set your rate, update your availability, and build your reputation as an umpire.</p>

        {saved && (
          <div className="mb-6 bg-emerald-50 text-emerald-700 px-4 py-3 rounded-xl text-sm font-medium">
            ✅ Saved successfully!
          </div>
        )}
        {error && (
          <div className="mb-6 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Hourly Rate (RM)</label>
            <input type="number" min="0" step="5" value={rate} onChange={(e) => setRate(e.target.value)}
              placeholder="e.g. 50" className={inputCls} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Availability Days</label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <button key={d} type="button" onClick={() => toggleDay(d)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                    selectedDays.includes(d)
                      ? "bg-emerald-700 text-white border-emerald-700"
                      : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300"
                  }`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Certification</label>
              <input value={certification} onChange={(e) => setCertification(e.target.value)}
                placeholder="e.g. BWF Level 1" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">License Number</label>
              <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="e.g. MBEA-2026-001" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Experience (years)</label>
            <input type="number" min="0" value={experienceYears} onChange={(e) => setExperienceYears(parseInt(e.target.value) || 0)}
              className={inputCls} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Languages</label>
            <input value={languages} onChange={(e) => setLanguages(e.target.value)}
              placeholder="e.g. Malay, English, Mandarin" className={inputCls} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Bio</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3}
              placeholder="Tell organizers about your umpiring experience..."
              className={`${inputCls} resize-none`} />
          </div>

          <button onClick={handleSave} disabled={saving}
            className="w-full bg-emerald-700 text-white py-3 rounded-xl font-bold hover:bg-emerald-600 disabled:opacity-50 transition-all">
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
