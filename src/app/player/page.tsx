"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";

interface Tournament {
  id: string;
  title: string;
  tournament_type: string;
  poster_url: string;
  venue: string;
  start_date: string;
  end_date: string;
  entry_fee: number;
  prize: string;
  status: string;
  description: string;
}

interface MatchRecord {
  id: string;
  round: string;
  match_number: number;
  status: string;
  tournament_id: string;
  tournament_title: string;
  tournament_status: string;
  category_name: string;
  opponent_name: string;
  my_side: string;
  result: string;
  games_completed: number;
  total_score_1: number;
  total_score_2: number;
}

export default function PlayerDashboardPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<"tournaments" | "matches">("tournaments");
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    loadTournaments();
    loadMatches();
  }, [user]);

  async function loadTournaments() {
    try {
      const res = await fetch("/api/tournaments/public?status=registration,published,in_progress&limit=50");
      if (res.ok) {
        const data = await res.json();
        setTournaments(data.tournaments || []);
      } else {
        setError("Failed to load tournaments");
      }
    } catch (err) {
      setError("Network error loading tournaments");
    } finally {
      setLoading(false);
    }
  }

  async function loadMatches() {
    try {
      const res = await fetch("/api/player/matches", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMatches(data.matches || []);
      }
    } catch (err) {
      console.error("Failed to load match history", err);
    }
  }

  async function handleJoin(tournamentId: string) {
    if (!user) {
      router.push("/auth/login");
      return;
    }
    setJoining(tournamentId);
    try {
      const res = await fetch(`/api/tournament_registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournament_id: tournamentId,
          category_id: null,
        }),
      });
      if (res.ok) {
        alert("✅ Registration submitted! Waiting for organizer approval.");
      } else {
        const data = await res.json();
        alert(data.error || "Failed to register");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setJoining(null);
    }
  }

  useEffect(() => {
    function handleClick() { setProfileMenuOpen(false); }
    if (profileMenuOpen) {
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [profileMenuOpen]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!user) return null;

  const resultBadge = (r: string) => {
    switch (r) {
      case "win": return <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">WIN</span>;
      case "loss": return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-bold">LOSS</span>;
      case "live": return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-bold animate-pulse">LIVE</span>;
      default: return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">UPCOMING</span>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ─── Header ─────────────────────── */}
      <nav className="bg-emerald-900 text-white px-3 md:px-6 py-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 overflow-hidden">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-black">TUAH</span>
          <span className="text-xs bg-emerald-700 px-2 py-0.5 rounded-full">Player</span>
        </Link>
        <div className="flex flex-wrap items-center gap-2 md:gap-4 min-w-0">
          <button onClick={() => setTab("tournaments")}
            className={`text-sm px-3 py-1.5 rounded-lg ${tab === "tournaments" ? "bg-emerald-700 font-semibold" : "text-emerald-200 hover:text-emerald-100"}`}>
            Tournaments
          </button>
          <button onClick={() => setTab("matches")}
            className={`text-sm px-3 py-1.5 rounded-lg ${tab === "matches" ? "bg-emerald-700 font-semibold" : "text-emerald-200 hover:text-emerald-100"}`}>
            My Matches {matches.length > 0 && <span className="ml-1 text-xs bg-emerald-800 px-1.5 py-0.5 rounded-full">{matches.length}</span>}
          </button>
          <Link href="/profile" className="text-sm text-emerald-200 hover:text-emerald-100">
            Profile
          </Link>
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setProfileMenuOpen(!profileMenuOpen); }}
              className="flex items-center gap-2 text-sm text-emerald-200 bg-emerald-800 px-3 py-2 rounded-lg max-w-[180px]"
            >
              <span className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-xs font-bold shrink-0">
                {(user.name || user.email || "U")[0].toUpperCase()}
              </span>
              <span className="truncate">{user.name || user.email}</span>
            </button>
            {profileMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50">
                <Link href="/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  My Profile
                </Link>
                <hr className="my-1 border-gray-100" />
                <button
                  onClick={() => { setProfileMenuOpen(false); signOut(); }}
                  className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {tab === "tournaments" ? (
          <>
            <div className="mb-8">
              <h1 className="text-3xl font-black text-gray-900">Available Tournaments</h1>
              <p className="text-gray-500 mt-1">Browse tournaments and register to join</p>
            </div>

            {error && (
              <div className="mb-6 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
            )}

            {tournaments.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-6xl mb-4">🏸</div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">No Tournaments Available</h2>
                <p className="text-gray-500">There are no tournaments open for registration right now.</p>
                <Link href="/" className="inline-block mt-4 text-emerald-700 font-medium hover:underline">
                  Back to Home
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tournaments.map((t) => (
                  <div key={t.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
                    {/* Poster */}
                    {t.poster_url ? (
                      <img src={t.poster_url} alt={t.title} className="w-full h-36 object-cover" />
                    ) : (
                      <div className="w-full h-36 bg-gradient-to-br from-emerald-700 to-emerald-900 flex items-center justify-center">
                        <span className="text-5xl">🏸</span>
                      </div>
                    )}

                    <div className="p-5 space-y-3">
                      {/* Type badge */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium capitalize">
                          {t.tournament_type || "Open"}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium">
                          {t.status}
                        </span>
                      </div>

                      {/* Title */}
                      <h2 className="text-lg font-bold text-gray-900 line-clamp-2">{t.title}</h2>

                      {/* Details */}
                      <div className="space-y-1 text-sm text-gray-500">
                        {t.venue && <p className="flex items-center gap-1">📍 {t.venue}</p>}
                        {t.start_date && (
                          <p className="flex items-center gap-1">
                            🗓 {new Date(t.start_date).toLocaleDateString()}
                            {t.end_date && ` — ${new Date(t.end_date).toLocaleDateString()}`}
                          </p>
                        )}
                        {t.entry_fee > 0 && (
                          <p className="flex items-center gap-1 font-semibold text-emerald-700">
                            💰 RM {parseFloat(t.entry_fee as any).toFixed(2)}
                          </p>
                        )}
                        {t.prize && <p className="flex items-center gap-1">🏆 {t.prize}</p>}
                      </div>

                      {/* Description */}
                      {t.description && (
                        <p className="text-xs text-gray-400 line-clamp-2">{t.description}</p>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Link
                          href={`/tournament/${t.id}`}
                          className="flex-1 text-center px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 font-medium hover:bg-gray-50"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => handleJoin(t.id)}
                          disabled={joining === t.id}
                          className="flex-1 px-3 py-2 bg-emerald-700 text-white rounded-lg text-sm font-bold hover:bg-emerald-600 disabled:opacity-50"
                        >
                          {joining === t.id ? "Joining..." : "Join"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-3xl font-black text-gray-900">My Match History</h1>
              <p className="text-gray-500 mt-1">Track your results across all tournaments</p>
            </div>

            {matches.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-6xl mb-4">🏸</div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">No Matches Yet</h2>
                <p className="text-gray-500">Once you join a tournament and get drawn into matches, your history will show up here.</p>
                <button onClick={() => setTab("tournaments")} className="inline-block mt-4 bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-emerald-600">
                  Browse Tournaments →
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="divide-y divide-gray-50">
                  {matches.map((m) => (
                    <div key={m.id} className="p-5 flex items-center justify-between gap-4 hover:bg-gray-50/50 transition-colors">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {resultBadge(m.result)}
                          <span className="text-xs text-gray-400">{m.category_name} · {m.round}</span>
                        </div>
                        <p className="font-semibold text-gray-900 truncate">
                          Me <span className="text-gray-400 font-normal">vs</span> {m.opponent_name}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {m.tournament_title}
                          {m.status === "completed" && m.games_completed > 0 && ` · ${m.games_completed} game${m.games_completed === 1 ? "" : "s"} played`}
                        </p>
                      </div>
                      <Link href={`/tournament/${m.tournament_id}`}
                        className="shrink-0 text-sm text-emerald-700 font-medium border border-emerald-200 px-4 py-2 rounded-lg hover:bg-emerald-50">
                        View Tournament
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
