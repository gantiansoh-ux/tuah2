"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
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
  // P1-002: search / status filter / pagination
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<any>(null);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSearchEffect = useRef(true);

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
    // Restore search/status/page from URL params (refresh keeps state)
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get("search") || "";
    const st = sp.get("status") || "";
    const p = Math.max(1, parseInt(sp.get("page") || "1") || 1);
    setSearch(q);
    setStatusFilter(st);
    setPage(p);
    loadTournaments(p, st, q, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Search debounce (300ms) — resets to page 1 (public parity)
  useEffect(() => {
    if (skipSearchEffect.current) {
      skipSearchEffect.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      loadTournaments(1, statusFilter, search, true);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function loadTournaments(p: number, st: string, q: string, push = true) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "12" });
      if (st) params.set("status", st);
      if (q.trim()) params.set("search", q.trim());
      const res = await fetch(`/api/tournaments/list?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTournaments(data.tournaments || []);
        setPagination(data.pagination || null);
        setStatusCounts(data.status_counts || {});
        if (push) window.history.replaceState(null, "", `/organizer?${params.toString()}`);
      }
    } catch (err) {
      console.error("Failed to load tournaments:", err);
    } finally {
      setLoading(false);
    }
  }

  function pickStatus(st: string) {
    setStatusFilter(st);
    setPage(1);
    loadTournaments(1, st, search, true);
  }

  function goPage(p: number) {
    if (p < 1) return;
    setPage(p);
    loadTournaments(p, statusFilter, search, true);
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

  // P1-002: stats read from status_counts (whole-org scope; unaffected by filters)
  const stats: DashboardStats = {
    total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
    active:
      (statusCounts.in_progress || 0) +
      (statusCounts.live || 0) +
      (statusCounts.published || 0) +
      (statusCounts.registration || 0),
    drafts: statusCounts.draft || 0,
    completed: statusCounts.completed || 0,
  };

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

        {/* P1-002: Search + Status Filter */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tournaments..."
              className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => pickStatus("")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${statusFilter === "" ? "bg-emerald-700 text-white border-emerald-700" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400"}`}
            >
              All
            </button>
            {Object.keys(STATUS_KEYS).map((st) => (
              <button
                key={st}
                onClick={() => pickStatus(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${statusFilter === st ? "bg-emerald-700 text-white border-emerald-700" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400"}`}
              >
                {STATUS_KEYS[st]}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Loading State ────────────────────────────────────── */}
        {loading && (
          <div className="text-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-400">Loading tournaments...</p>
          </div>
        )}

        {/* ─── Empty State ──────────────────────────────────────── */}
        {!loading && tournaments.length === 0 && (search || statusFilter) && (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="text-6xl mb-4">🔍</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No tournaments found</h2>
            <p className="text-gray-400 mb-6">Try adjusting your search or filters</p>
            <button
              onClick={() => { setSearch(""); setStatusFilter(""); setPage(1); loadTournaments(1, "", "", true); }}
              className="bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-emerald-600"
            >
              Clear filters
            </button>
          </div>
        )}
        {!loading && tournaments.length === 0 && !search && !statusFilter && (
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

        {/* P1-002: Pagination */}
        {!loading && pagination && pagination.total > 0 && (
          <div className="flex items-center justify-between mt-10 text-sm text-gray-600">
            <span>
              Showing {tournaments.length} of {pagination.total}
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => goPage(page - 1)}
                disabled={page <= 1}
                className="px-4 py-2 rounded-xl bg-white border border-gray-200 font-semibold disabled:opacity-40 hover:border-emerald-400 transition-colors"
              >
                ← Prev
              </button>
              <span className="font-semibold text-gray-800">
                Page {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => goPage(page + 1)}
                disabled={!pagination.hasMore}
                className="px-4 py-2 rounded-xl bg-white border border-gray-200 font-semibold disabled:opacity-40 hover:border-emerald-400 transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
