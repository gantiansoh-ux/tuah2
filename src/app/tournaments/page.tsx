"use client";

// /tournaments — public tournament listing (SPEC 2, Lucy's wireframe)
// Consumes the existing verified API: GET /api/tournaments/public?page&limit&type&search

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

interface PublicTournament {
  id: string;
  title: string;
  tournament_type: string;
  poster_url: string | null;
  venue: string | null;
  start_date: string;
  end_date: string;
  entry_fee: string;
  prize: string | null;
  status: string;
  description: string | null;
}

const TYPES = [
  "open", "junior", "school", "league", "festival", "corporate",
  "veteran", "team_event", "knockout", "round_robin", "ladder",
];

const TYPE_COLORS: Record<string, string> = {
  open: "bg-green-700", junior: "bg-amber-600", school: "bg-sky-600",
  league: "bg-indigo-600", festival: "bg-rose-600", corporate: "bg-slate-700",
  veteran: "bg-teal-700", team_event: "bg-orange-600", knockout: "bg-red-600",
  round_robin: "bg-cyan-700", ladder: "bg-purple-600",
};

const TYPE_LABEL: Record<string, string> = {
  open: "Open", junior: "Junior", school: "School", league: "League",
  festival: "Festival", corporate: "Corporate", veteran: "Veteran",
  team_event: "Team Event", knockout: "Knockout", round_robin: "Round Robin",
  ladder: "Ladder",
};

function statusBadge(s: string) {
  if (s === "in_progress" || s === "live")
    return (
      <span className="inline-flex items-center gap-1.5 bg-red-100 text-red-700 text-xs font-bold px-3 py-1 rounded-full">
        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>LIVE
      </span>
    );
  if (s === "registration")
    return <span className="inline-flex items-center bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full">Registration Open</span>;
  if (s === "published")
    return <span className="inline-flex items-center bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full">OPEN</span>;
  if (s === "completed")
    return <span className="inline-flex items-center bg-gray-200 text-gray-600 text-xs font-bold px-3 py-1 rounded-full">COMPLETED</span>;
  return <span className="inline-flex items-center bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full">Upcoming</span>;
}

function fmtDateRange(startIso: string, endIso: string): string {
  try {
    const s = new Date(startIso);
    const e = new Date(endIso);
    const fmt = (d: Date) =>
      d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    if (e.getTime() !== s.getTime() && fmt(e) !== fmt(s)) {
      // "Aug 19 – 20, 2026" style when same year
      if (s.getFullYear() === e.getFullYear()) {
        const short = (d: Date) =>
          d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
        const year = s.getFullYear();
        if (s.getMonth() === e.getMonth())
          return `${short(s)} – ${e.getDate()}, ${year}`;
        return `${short(s)} – ${short(e)}, ${year}`;
      }
      return `${fmt(s)} – ${fmt(e)}`;
    }
    return fmt(s);
  } catch {
    return "";
  }
}

function fmtFee(fee: string): { label: string; free: boolean } {
  const n = parseFloat(fee || "0");
  if (!isFinite(n) || n <= 0) return { label: "FREE", free: true };
  return { label: `RM ${n.toFixed(2)}`, free: false };
}

export default function TournamentsPage() {
  const { user, signOut } = useAuth();
  const [data, setData] = useState<{ tournaments: PublicTournament[]; pagination: any } | null>(null);
  const [error, setError] = useState(false);
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((p: number, t: string, q: string, push = true) => {
    const params = new URLSearchParams({ page: String(p), limit: "12" });
    if (t) params.set("type", t);
    if (q.trim()) params.set("search", q.trim());
    fetch(`/api/tournaments/public?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error("bad status");
        return r.json();
      })
      .then((d) => {
        setData(d);
        setError(false);
        if (push) window.history.replaceState(null, "", `/tournaments?${params.toString()}`);
      })
      .catch(() => setError(true));
  }, []);

  // Initial load + URL params
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("type") || "";
    const q = sp.get("search") || "";
    const p = Math.max(1, parseInt(sp.get("page") || "1") || 1);
    setType(t);
    setSearch(q);
    load(p, t, q, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search debounce (300ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load(1, type, search);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const pickType = (t: string) => {
    setType(t);
    setPage(1);
    load(1, t, search);
  };

  const goPage = (p: number) => {
    if (p < 1) return;
    setPage(p);
    load(p, type, search);
  };

  const tournaments = data?.tournaments || [];
  const pagination = data?.pagination;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-emerald-900 text-white px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-black tracking-tight">TUAH</span>
          <span className="text-emerald-300 text-xs font-medium">.com</span>
        </Link>
        <div className="flex items-center gap-4">
          {user ? (
            <>
              {user.role === "organizer" || user.role === "admin" ? (
                <Link href="/organizer" className="text-sm hover:text-emerald-300">Dashboard</Link>
              ) : user.role === "player" ? (
                <Link href="/player" className="text-sm hover:text-emerald-300">Player</Link>
              ) : null}
              <button onClick={signOut} className="text-sm bg-emerald-700 px-4 py-2 rounded-lg hover:bg-emerald-600">
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="text-sm hover:text-emerald-300">Log In</Link>
              <Link href="/auth/register" className="text-sm bg-emerald-600 px-4 py-2 rounded-lg hover:bg-emerald-500 font-semibold">
                Get Started
              </Link>
            </>
          )}
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-black text-gray-900 mb-2">Tournaments</h1>
        <p className="text-gray-500 mb-8">Find and join badminton tournaments near you</p>

        {/* Search */}
        <div className="mb-6 max-w-md">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tournaments..."
              className="w-full bg-white border border-gray-200 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Type chips */}
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => pickType("")}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              type === "" ? "bg-emerald-700 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-emerald-400"
            }`}
          >
            All
          </button>
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => pickType(t)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                type === t ? "bg-emerald-700 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-emerald-400"
              }`}
            >
              {TYPE_LABEL[t] || t}
            </button>
          ))}
        </div>

        {/* Loading skeletons */}
        {!data && !error && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm animate-pulse">
                <div className="h-32 bg-gray-100 rounded-t-2xl"></div>
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-center py-16">
            <p className="text-gray-500 mb-4">Failed to load tournaments</p>
            <button
              onClick={() => load(page, type, search, false)}
              className="bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-emerald-600"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty */}
        {data && !error && tournaments.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🏸</p>
            <p className="text-gray-500 mb-4">No tournaments found</p>
            <button
              onClick={() => { setSearch(""); setType(""); setPage(1); load(1, "", ""); }}
              className="bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-emerald-600"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Grid */}
        {data && !error && tournaments.length > 0 && (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {tournaments.map((t) => {
                const fee = fmtFee(t.entry_fee);
                return (
                  <Link
                    key={t.id}
                    href={`/tournament/${t.id}`}
                    className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-xl transition-all hover:-translate-y-1 hover:border-emerald-200 group flex flex-col"
                  >
                    {/* Poster */}
                    {t.poster_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.poster_url} alt={t.title} className="h-32 w-full object-cover" />
                    ) : (
                      <div className="h-32 w-full bg-gradient-to-br from-emerald-900 via-emerald-800 to-green-700 flex items-center justify-center gap-2">
                        <span className="text-4xl">🏸</span>
                        <span className="text-xs font-bold text-emerald-200 uppercase tracking-wider">
                          {(TYPE_LABEL[t.tournament_type] || t.tournament_type).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="p-5 flex flex-col gap-2 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-base font-bold text-gray-900 leading-snug group-hover:text-emerald-700 transition-colors line-clamp-2">
                          {t.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`${TYPE_COLORS[t.tournament_type] || "bg-gray-600"} text-white text-[10px] font-bold uppercase px-2 py-0.5 rounded`}>
                          {TYPE_LABEL[t.tournament_type] || t.tournament_type}
                        </span>
                        {statusBadge(t.status)}
                      </div>
                      <p className="text-xs text-gray-500">📅 {fmtDateRange(t.start_date, t.end_date)}</p>
                      <p className="text-xs text-gray-500">📍 {t.venue || "Venue TBD"}</p>
                      <div className="flex items-center gap-2 flex-wrap mt-auto pt-2">
                        {fee.free ? (
                          <span className="text-xs font-bold bg-green-100 text-green-700 px-2.5 py-1 rounded-full">FREE</span>
                        ) : (
                          <span className="text-xs font-semibold bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">{fee.label}</span>
                        )}
                        {t.prize && (
                          <span className="text-xs font-semibold bg-yellow-50 text-yellow-700 px-2.5 py-1 rounded-full truncate max-w-[160px]">
                            🏆 {t.prize}
                          </span>
                        )}
                      </div>
                      <span className="mt-3 bg-emerald-700 text-white text-sm font-bold text-center py-2.5 rounded-xl group-hover:bg-emerald-600 transition-colors">
                        View →
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Pagination */}
            {pagination && (
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
                  <span className="font-semibold text-gray-800">Page {pagination.page} / {pagination.totalPages}</span>
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
          </>
        )}
      </div>
    </div>
  );
}
