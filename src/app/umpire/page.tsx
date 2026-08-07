"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";

interface MyMatch {
  id: string;
  round: string;
  match_number: number;
  status: string;
  court_number: number | null;
  scheduled_time: string | null;
  tournament_id: string;
  tournament_title: string;
  tournament_status: string;
  category_name: string;
  player_1_name: string;
  player_2_name: string;
  winner_entry_id: string | null;
}

interface OpenTournament {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  category_count: number;
}

export default function UmpireDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [matches, setMatches] = useState<MyMatch[]>([]);
  const [rating, setRating] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [openTournaments, setOpenTournaments] = useState<OpenTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyMsg, setApplyMsg] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) loadAll();
  }, [authLoading, user]);

  async function loadAll() {
    setLoading(true);
    try {
      const res = await fetch("/api/umpires/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMatches(data.matches || []);
        setRating(data.rating || null);
        setApplications(data.applications || []);
        setOpenTournaments(data.openTournaments || []);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function apply(tournamentId: string) {
    try {
      const res = await fetch("/api/umpires/apply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournament_id: tournamentId,
          message: applyMsg[tournamentId] || "",
        }),
      });
      if (res.ok) {
        setToast("Application submitted! ✅");
        setTimeout(() => setToast(null), 3000);
        loadAll();
      } else {
        const err = await res.json();
        setToast(err.error || "Failed to apply");
        setTimeout(() => setToast(null), 3000);
      }
    } catch {
      setToast("Network error");
      setTimeout(() => setToast(null), 3000);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-3xl p-10 shadow-xl max-w-sm w-full text-center">
          <div className="text-6xl mb-4">👤</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Umpire Sign In</h1>
          <p className="text-gray-500 mb-6">Sign in with your umpire account to see your assigned matches.</p>
          <Link href="/auth/login" className="block w-full bg-emerald-700 text-white py-3 rounded-xl font-bold hover:bg-emerald-600 mb-3">
            Sign In
          </Link>
          <Link href="/auth/register" className="block w-full py-3 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50">
            Create Umpire Account
          </Link>
        </div>
      </div>
    );
  }

  const live = matches.filter((m) => m.status === "in_progress" || m.status === "playing");
  const upcoming = matches.filter((m) => m.status === "scheduled");
  const done = matches.filter((m) => m.status === "completed" || m.status === "walkover");

  // #31: only umpire accounts may apply. Non-umpires see a disabled state
  // instead of a silent 403 from the API.
  const isUmpire = user.role === "umpire";

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-emerald-900 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">🦉</span>
          <span className="font-bold">Umpire Dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          {rating && rating.review_count > 0 && (
            <span className="text-sm bg-emerald-800 px-3 py-1 rounded-full">
              ⭐ {rating.avg_rating} ({rating.review_count})
            </span>
          )}
          <span className="text-sm text-emerald-200">{user.email}</span>
          <Link href="/umpire/profile" className="text-sm bg-emerald-800 px-3 py-1.5 rounded-lg hover:bg-emerald-700 font-medium">⚙️ Profile & Availability</Link>
          <Link href="/" className="text-sm text-emerald-200 hover:text-emerald-100">← Home</Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {toast && (
          <div className="fixed top-4 right-4 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm">
            {toast}
          </div>
        )}

        {/* My Rating */}
        {rating && rating.review_count > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8 flex items-center gap-6">
            <div className="text-center">
              <div className="text-4xl font-black text-emerald-700">{rating.avg_rating}</div>
              <div className="text-xs text-gray-400 mt-1">avg rating</div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1 mb-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s} className={`text-2xl ${s <= Math.round(rating.avg_rating) ? "text-amber-400" : "text-gray-200"}`}>★</span>
                ))}
              </div>
              <p className="text-sm text-gray-500">{rating.review_count} review(s) from organizers · best {rating.best_rating}★</p>
            </div>
          </div>
        )}

        {/* Assigned Matches */}
        <h2 className="text-2xl font-bold text-gray-900 mb-4">🎯 My Matches</h2>

        {live.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-bold text-red-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" /> LIVE NOW
            </h3>
            {live.map((m) => (
              <div key={m.id} className="bg-white rounded-2xl shadow-sm border-l-4 border-red-500 p-4 mb-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{m.player_1_name || "TBD"} <span className="text-gray-400">vs</span> {m.player_2_name || "TBD"}</p>
                  <p className="text-xs text-gray-400 mt-1">{m.tournament_title} · {m.category_name} · {m.round}{m.court_number ? ` · Court ${m.court_number}` : ""}</p>
                </div>
                <Link href={`/umpire/v2/${m.id}`}
                  className="bg-red-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-red-600">
                  ▶ Open Pad
                </Link>
              </div>
            ))}
          </div>
        )}

        {upcoming.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">UPCOMING</h3>
            {upcoming.map((m) => (
              <div key={m.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{m.player_1_name || "TBD"} <span className="text-gray-400">vs</span> {m.player_2_name || "TBD"}</p>
                  <p className="text-xs text-gray-400 mt-1">{m.tournament_title} · {m.category_name} · {m.round}{m.scheduled_time ? ` · ${new Date(m.scheduled_time).toLocaleString()}` : ""}</p>
                </div>
                <Link href={`/umpire/v2/${m.id}`}
                  className="bg-emerald-700 text-white px-4 py-2 rounded-xl font-semibold text-sm hover:bg-emerald-600">
                  Open Pad
                </Link>
              </div>
            ))}
          </div>
        )}

        {done.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">COMPLETED ({done.length})</h3>
            <div className="space-y-2">
              {done.map((m) => (
                <div key={m.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-between">
                  <p className="text-sm text-gray-600">{m.tournament_title} · {m.category_name} · {m.round}</p>
                  <p className="text-sm font-semibold text-gray-800">
                    {m.player_1_name || "?"} <span className="text-gray-300">vs</span> {m.player_2_name || "?"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {matches.length === 0 && (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 text-center mb-8">
            <div className="text-5xl mb-3">🦉</div>
            <p className="text-gray-500 font-medium">No matches assigned yet</p>
            <p className="text-sm text-gray-400 mt-1">Organizers will assign you to matches, or apply to open tournaments below.</p>
          </div>
        )}

        {/* My Applications */}
        {applications.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">MY APPLICATIONS</h3>
            <div className="space-y-2">
              {applications.map((a) => (
                <div key={a.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{a.tournament_title}</p>
                    {a.message && <p className="text-xs text-gray-400 mt-0.5">"{a.message}"</p>}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    a.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                    a.status === "rejected" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"
                  }`}>
                    {a.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Open Tournaments - apply */}
        {openTournaments.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">📋 Open Tournaments</h2>
            <p className="text-sm text-gray-400 mb-4">
              {isUmpire
                ? "Apply to umpire these tournaments — organizers will review your application."
                : "Your account is not set as an umpire. Switch your role or register an umpire account to apply."}
            </p>
            <div className="space-y-3">
              {openTournaments.map((t) => {
                const applied = applications.some((a) => a.tournament_id === t.id && a.status === "pending");
                return (
                  <div key={t.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">{t.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {t.status} · {t.category_count} categor{t.category_count === 1 ? "y" : "ies"}
                          {t.start_date ? ` · ${new Date(t.start_date).toLocaleDateString()}` : ""}
                        </p>
                      </div>
                      {applied ? (
                        <span className="text-xs px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 font-medium">⏳ Applied</span>
                      ) : !isUmpire ? (
                        <span className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-500 font-medium" title="Only umpire accounts can apply">
                          🔒 Umpire account required
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            value={applyMsg[t.id] || ""}
                            onChange={(e) => setApplyMsg((p) => ({ ...p, [t.id]: e.target.value }))}
                            placeholder="Message (optional)"
                            className="w-44 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500"
                          />
                          <button onClick={() => apply(t.id)}
                            className="bg-emerald-700 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-emerald-600">
                            Apply
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
