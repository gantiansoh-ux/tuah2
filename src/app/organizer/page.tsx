"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";

// ─── Types ──────────────────────────────────────
interface Tournament {
  id: string;
  title: string;
  name: string;
  status: string;
  venue: string;
  location: string;
  start_date: string;
  end_date: string;
  tournament_type: string;
  poster_url: string;
  created_at: string;
}

interface DashboardStats {
  total: number;
  active: number;
  drafts: number;
  completed: number;
}

// ─── Helpers ────────────────────────────────────
const TOURNAMENT_TYPE_INFO: Record<string, { label: string; icon: string; color: string }> = {
  junior: { label: "Junior", icon: "🧒", color: "bg-orange-100 text-orange-700" },
  open: { label: "Open", icon: "🌍", color: "bg-blue-100 text-blue-700" },
  school: { label: "School", icon: "🏫", color: "bg-yellow-100 text-yellow-700" },
  corporate: { label: "Corporate", icon: "💼", color: "bg-indigo-100 text-indigo-700" },
  veteran: { label: "Veteran", icon: "👴", color: "bg-purple-100 text-purple-700" },
  team_event: { label: "Team Event", icon: "👥", color: "bg-teal-100 text-teal-700" },
  league: { label: "League", icon: "🏅", color: "bg-pink-100 text-pink-700" },
  knockout: { label: "Knockout", icon: "❌", color: "bg-red-100 text-red-700" },
  round_robin: { label: "Round Robin", icon: "🔄", color: "bg-cyan-100 text-cyan-700" },
  ladder: { label: "Ladder", icon: "🪜", color: "bg-amber-100 text-amber-700" },
  festival: { label: "Festival", icon: "🎪", color: "bg-green-100 text-green-700" },
};

const STATUS_KEYS: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  registration: "Registration",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

function getStatusStyle(status: string): string {
  switch (status) {
    case "draft":
      return "bg-gray-100 text-gray-600";
    case "published":
    case "registration":
      return "bg-blue-100 text-blue-700";
    case "in_progress":
    case "live":
      return "bg-green-100 text-green-700";
    case "completed":
      return "bg-purple-100 text-purple-700";
    case "cancelled":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function getTypeInfo(type: string | null | undefined) {
  return TOURNAMENT_TYPE_INFO[type || ""] || {
    label: type || "Tournament",
    icon: "🏆",
    color: "bg-gray-100 text-gray-600",
  };
}

function computeStats(tournaments: Tournament[]): DashboardStats {
  let active = 0;
  let drafts = 0;
  let completed = 0;
  for (const t of tournaments) {
    if (t.status === "in_progress" || t.status === "live" || t.status === "published" || t.status === "registration") {
      active++;
    } else if (t.status === "draft") {
      drafts++;
    } else if (t.status === "completed") {
      completed++;
    }
  }
  return { total: tournaments.length, active, drafts, completed };
}

// ─── Page Component ─────────────────────────────
function fmtLocalDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function OrganizerDashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
    } else if (!authLoading && user && user.role !== 'organizer' && user.role !== 'admin') {
      // Players and umpires don't belong in the organizer dashboard
      router.push("/");
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    loadTournaments();
  }, [user]);

  async function loadTournaments() {
    setLoading(true);
    try {
      const res = await fetch("/api/tournaments/list");
      if (res.ok) {
        const data = await res.json();
        setTournaments(data.tournaments || []);
      }
    } catch (err) {
      console.error("Failed to load tournaments:", err);
    } finally {
      setLoading(false);
    }
  }

  // Close profile menu on outside click
  useEffect(() => {
    function handleClick() {
      setProfileMenuOpen(false);
    }
    if (profileMenuOpen) {
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [profileMenuOpen]);

  if (authLoading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  if (!user) return null;

  const stats = computeStats(tournaments);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <nav className="bg-emerald-900 text-white px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-black">TUAH</span>
        </Link>
        <div className="flex items-center gap-4">
          {/* Profile dropdown */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setProfileMenuOpen(!profileMenuOpen);
              }}
              className="flex items-center gap-2 text-sm text-emerald-200 hover:text-emerald-100 bg-emerald-800 px-3 py-2 rounded-lg"
            >
              <span className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-xs font-bold text-white">
                {(user.name || user.email || "U")[0].toUpperCase()}
              </span>
              <span>{user.name || user.email}</span>
              <svg
                className={`w-4 h-4 transition-transform ${profileMenuOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {profileMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50">
                <Link
                  href="/profile"
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setProfileMenuOpen(false)}
                >
                  👤 My Profile
                </Link>
                <hr className="my-1 border-gray-100" />
                <button
                  onClick={() => {
                    setProfileMenuOpen(false);
                    signOut();
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  🚪 Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* ─── Welcome ──────────────────────────────────────────── */}
        <div className="mb-8">
          <h1 className="text-3xl font-black text-gray-900">
            Welcome back{user.name ? `, ${user.name}` : ""} 👋
          </h1>
          <p className="text-gray-500 mt-1">Manage your tournaments and events</p>
        </div>

        {/* ─── Stats Cards ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">🏆</span>
              <span className="text-3xl font-black text-gray-900">{stats.total}</span>
            </div>
            <p className="text-sm text-gray-500">Total Tournaments</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">▶️</span>
              <span className="text-3xl font-black text-emerald-600">{stats.active}</span>
            </div>
            <p className="text-sm text-gray-500">Active</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">📝</span>
              <span className="text-3xl font-black text-amber-600">{stats.drafts}</span>
            </div>
            <p className="text-sm text-gray-500">Drafts</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">✅</span>
              <span className="text-3xl font-black text-purple-600">{stats.completed}</span>
            </div>
            <p className="text-sm text-gray-500">Completed</p>
          </div>
        </div>

        {/* ─── Header + Create Button ────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Your Tournaments</h2>
          <Link
            href="/organizer/create"
            className="bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg inline-flex items-center gap-2"
          >
            <span>+</span> Create Tournament
          </Link>
        </div>

        {/* ─── Loading State ────────────────────────────────────── */}
        {loading && (
          <div className="text-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-400">Loading tournaments...</p>
          </div>
        )}

        {/* ─── Empty State ──────────────────────────────────────── */}
        {!loading && tournaments.length === 0 && (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No tournaments yet</h2>
            <p className="text-gray-400 mb-6">Create your first tournament to get started</p>
            <Link
              href="/organizer/create"
              className="bg-emerald-700 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-600 inline-block"
            >
              Create Tournament
            </Link>
          </div>
        )}

        {/* ─── Tournament List ──────────────────────────────────── */}
        {!loading && tournaments.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tournaments.map((t) => {
              const typeInfo = getTypeInfo(t.tournament_type);
              return (
                <Link
                  key={t.id}
                  href={`/organizer/${t.id}`}
                  className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
                >
                  {/* Poster thumbnail */}
                  {t.poster_url ? (
                    <div className="h-32 bg-gray-100 overflow-hidden">
                      <img
                        src={t.poster_url}
                        alt={t.title || t.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="h-32 bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center">
                      <span className="text-4xl">{typeInfo.icon}</span>
                    </div>
                  )}
                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                      {/* Type badge */}
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeInfo.color}`}
                      >
                        {typeInfo.icon} {typeInfo.label}
                      </span>
                      {/* Status badge */}
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusStyle(
                          t.status
                        )}`}
                      >
                        {STATUS_KEYS[t.status] || t.status}
                      </span>
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1 line-clamp-1">
                      {t.title || t.name}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span>
                        📅 {fmtLocalDate(t.start_date)}
                        {t.end_date && t.end_date !== t.start_date
                          ? ` → ${fmtLocalDate(t.end_date)}`
                          : ""}
                      </span>
                    </div>
                    {(t.venue || t.location) && (
                      <p className="text-sm text-gray-400 mt-1">📍 {t.venue || t.location}</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
