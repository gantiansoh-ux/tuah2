"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, use, useRef } from "react";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import type { Tournament, Category, Match, Game, Entry } from "@/lib/types";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) _supabase = createClient();
  return _supabase;
}

function entryName(eid: string | null, entries: Entry[]): string {
  if (!eid) return "TBD";
  const e = entries.find((x) => x.id === eid);
  return e ? `Player ${e.player_1_id.slice(0, 6)}` : "?";
}

export default function AudiencePortalPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);
  const supabase = getSupabase();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [gamesByMatch, setGamesByMatch] = useState<Record<string, Game[]>>({});
  const [entries, setEntries] = useState<Entry[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const matchesRef = useRef<Match[]>([]);

  useEffect(() => { loadData(); }, [tournamentId]);

  useEffect(() => {
    const channel = supabase
      .channel("audience")
      .on("postgres_changes", { event: "*", schema: "public", table: "games" }, () => loadGamesRef())
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => loadMatches())
      .subscribe();
    const interval = setInterval(() => loadGamesRef(), 3000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, [tournamentId]);

  async function loadData() {
    const { data: t } = await supabase.from("tournaments").select("*").eq("id", tournamentId).single();
    setTournament(t as Tournament);
    const { data: cats } = await supabase.from("categories").select("*").eq("tournament_id", tournamentId);
    setCategories(cats as Category[] || []);
    const { data: ents } = await supabase.from("entries").select("*");
    setEntries(ents as Entry[] || []);
    await loadMatches();
    await loadGames();
  }

  async function loadMatches() {
    const { data: m } = await supabase.from("matches")
      .select("*").eq("tournament_id", tournamentId)
      .order("match_number");
    setMatches(m as Match[] || []);
    matchesRef.current = m as Match[] || [];
    if (m && m.length > 0) await loadGames(m as Match[]);
  }

  async function loadGames(matchList?: Match[]) {
    const list = matchList || matches;
    const mids = list.map((m) => m.id);
    if (mids.length === 0) return;
    const { data: gs } = await supabase.from("games")
      .select("*").in("match_id", mids)
      .order("game_number", { ascending: true });
    if (gs) {
      const g: Record<string, Game[]> = {};
      (gs as Game[]).forEach((x) => { if (!g[x.match_id]) g[x.match_id] = []; g[x.match_id].push(x); });
      setGamesByMatch(g);
    }
  }

  async function loadGamesRef() {
    const mids = matchesRef.current.map((m) => m.id);
    if (mids.length === 0) return;
    const { data: gs } = await supabase.from("games")
      .select("*").in("match_id", mids)
      .order("game_number", { ascending: true });
    if (gs) {
      const g: Record<string, Game[]> = {};
      (gs as Game[]).forEach((x) => { if (!g[x.match_id]) g[x.match_id] = []; g[x.match_id].push(x); });
      setGamesByMatch(g);
    }
  }

  function latestGame(mid: string): Game | null {
    const g = gamesByMatch[mid];
    return g && g.length > 0 ? g[g.length - 1] : null;
  }

  function catName(cid: string): string {
    return categories.find((c) => c.id === cid)?.name || "?";
  }

  const filtered = matches.filter((m) => {
    if (selectedCat && m.category_id !== selectedCat) return false;
    if (search) {
      const n1 = entryName(m.entry_1_id, entries).toLowerCase();
      const n2 = entryName(m.entry_2_id, entries).toLowerCase();
      if (!n1.includes(search.toLowerCase()) && !n2.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const live = filtered.filter((m) => m.status === "playing");
  const upcoming = filtered.filter((m) => m.status === "scheduled");
  const done = filtered.filter((m) => m.status === "completed");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <Link href="/" className="text-emerald-300 text-sm hover:underline">← Home</Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold mt-2">{tournament?.name}</h1>
              <p className="text-emerald-200 text-sm mt-1">
                {tournament?.start_date ? new Date(tournament.start_date).toLocaleDateString() : ""}
                {tournament?.end_date ? ` — ${new Date(tournament.end_date).toLocaleDateString()}` : ""}
              </p>
            </div>
            {tournament?.status === "published" && (
              <button onClick={() => setShowRegister(true)}
                className="bg-white text-emerald-900 font-bold px-6 py-3 rounded-xl hover:bg-emerald-50 transition-all">
                + Join Tournament
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Player Registration Modal */}
        {showRegister && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Join Tournament</h2>
              <p className="text-gray-500 mb-6">Select a category to register</p>
              <div className="space-y-3">
                {categories.length > 0 ? categories.map((cat) => (
                  <div key={cat.id} className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{cat.name}</p>
                      <p className="text-sm text-gray-400">{cat.type} · {cat.scoring_config.points_per_game}pts</p>
                    </div>
                    <button onClick={async () => {
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) {
                        alert("Please sign in first to register");
                        return;
                      }
                      await supabase.from("tournament_registrations").insert({
                        tournament_id: tournamentId,
                        player_id: user.id,
                        category_id: cat.id,
                        status: "pending",
                      });
                      alert("Registration submitted! Waiting for organizer approval.");
                      setShowRegister(false);
                    }}
                    className="bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600">
                      Register
                    </button>
                  </div>
                )) : <p className="text-gray-400">No categories available</p>}
              </div>
              <button onClick={() => setShowRegister(false)}
                className="w-full mt-4 py-3 border border-gray-200 rounded-xl text-gray-600 font-medium">Cancel</button>
            </div>
          </div>
        )}

        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Find my match (search player name)..."
          className="w-full px-6 py-4 rounded-2xl border border-gray-200 shadow-sm text-lg focus:ring-2 focus:ring-emerald-500 mb-6" />

        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={() => setSelectedCat(null)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${!selectedCat ? "bg-emerald-700 text-white" : "bg-white border border-gray-200 text-gray-600"}`}>All</button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setSelectedCat(c.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${selectedCat === c.id ? "bg-emerald-700 text-white" : "bg-white border border-gray-200 text-gray-600"}`}>
              {c.name}
            </button>
          ))}
        </div>

        {live.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" /> LIVE
            </h2>
            {live.map((m) => {
              const g = latestGame(m.id);
              return (
                <div key={m.id} className="bg-white rounded-2xl p-5 shadow-md border-l-4 border-red-500 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-500">{catName(m.category_id)} · {m.court_name || `Court ${(m.match_number % 10) + 1}`}</span>
                    <span className="text-xs text-gray-400">{m.round}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 font-bold text-lg text-gray-900">{entryName(m.entry_1_id, entries)}</div>
                    <div className="flex items-center gap-4 mx-4">
                      <div className="text-3xl font-black text-emerald-700">{g?.score_entry_1 ?? 0}</div>
                      <div className="text-xl font-bold text-gray-300">:</div>
                      <div className="text-3xl font-black text-blue-700">{g?.score_entry_2 ?? 0}</div>
                    </div>
                    <div className="flex-1 font-bold text-lg text-gray-900 text-right">{entryName(m.entry_2_id, entries)}</div>
                  </div>
                  <div className="text-center text-xs text-gray-400 mt-2">Game {g?.game_number || 1}</div>
                </div>
              );
            })}
          </div>
        )}

        {upcoming.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-3">Upcoming</h2>
            {upcoming.slice(0, 15).map((m) => (
              <div key={m.id} className="bg-white rounded-xl p-4 border border-gray-200 flex items-center justify-between mb-2">
                <div className="flex items-center gap-4">
                  <span className="text-gray-400 font-mono text-sm">{m.court_name || `C${(m.match_number % 10) + 1}`}</span>
                  <span className="font-medium text-gray-900">{entryName(m.entry_1_id, entries)}</span>
                  <span className="text-gray-400">vs</span>
                  <span className="font-medium text-gray-900">{entryName(m.entry_2_id, entries)}</span>
                </div>
                <span className="text-xs text-gray-400">{m.round}</span>
              </div>
            ))}
          </div>
        )}

        {done.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Results</h2>
            {done.map((m) => (
              <div key={m.id} className="bg-white rounded-xl p-4 border border-gray-200 flex items-center justify-between mb-2">
                <div className="flex items-center gap-4">
                  <span className="text-gray-400 font-mono text-sm">{m.round}</span>
                  <span className={`font-medium ${m.winner_id === m.entry_1_id ? "text-emerald-700 font-bold" : "text-gray-600"}`}>
                    {entryName(m.entry_1_id, entries)}
                  </span>
                  <span className="text-gray-300">-</span>
                  <span className={`font-medium ${m.winner_id === m.entry_2_id ? "text-emerald-700 font-bold" : "text-gray-600"}`}>
                    {entryName(m.entry_2_id, entries)}
                  </span>
                </div>
                {m.winner_id && <span className="text-emerald-700 text-xs font-medium">Winner</span>}
              </div>
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <div className="text-6xl mb-4">🏸</div>
            <p className="text-xl">No matches{search ? " matching your search" : ""}</p>
          </div>
        )}
      </div>
    </div>
  );
}
