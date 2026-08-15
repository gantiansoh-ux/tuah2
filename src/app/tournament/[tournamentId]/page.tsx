"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";
import type { Tournament, Category, Match, Game, Entry } from "@/lib/types";
import BracketView from "@/components/BracketView";

function entryName(eid: string | null, entries: Entry[]): string {
  if (!eid) return "TBD";
  const e = entries.find((x) => x.id === eid);
  if (!e) return "?";
  const name = e.player_1_name || `Player ${e.player_1_id.slice(0, 6)}`;
  if (e.player_2_name) {
    return `${name} / ${e.player_2_name}`;
  }
  return name;
}

// Round ordering for bracket display (earlier rounds first)
const ROUND_ORDER: Record<string, number> = {
  "Round Robin": 0,
  "Group": 1,
  "R64": 2,
  "R32": 3,
  "R16": 4,
  "QF": 5,
  "SF": 6,
  "Final": 7,
  "F": 7,
};

function roundRank(round: string): number {
  if (ROUND_ORDER[round] !== undefined) return ROUND_ORDER[round];
  // Fallback: try to parse like "Round 1"
  const m = round.match(/\d+/);
  if (m) return parseInt(m[0]);
  return 50;
}

export default function AudiencePortalPage({
  params,
}: {
  params: { tournamentId: string };
}) {
  const { tournamentId } = params;
  const { user } = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [gamesByMatch, setGamesByMatch] = useState<Record<string, Game[]>>({});
  const [entries, setEntries] = useState<Entry[]>([]);
  const [standings, setStandings] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  // TUA11 (2026-08-15): inline submission status so the player is not left in
  // the dark with alert()-only feedback.
  const [regMsg, setRegMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [view, setView] = useState<"matches" | "bracket">("matches");
  const matchesRef = useRef<Match[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { loadData(); }, [tournamentId]);

  // Poll every 5 seconds for updates
  useEffect(() => {
    pollRef.current = setInterval(() => refreshGames(), 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [tournamentId]);

  async function loadData() {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setTournament(data.tournament);
      setCategories(data.categories || []);
      setEntries(data.entries || []);
      if (data.matches) {
        setMatches(data.matches);
        matchesRef.current = data.matches;
        await loadGames(data.matches);
      }
      try {
        const st = await fetch(`/api/tournaments/${tournamentId}/standings`);
        if (st.ok) setStandings(await st.json());
      } catch {
        // best-effort
      }
    } catch (err) {
      console.error("Load data error:", err);
    }
  }

  async function refreshGames() {
    const mids = matchesRef.current.map((m) => m.id);
    if (mids.length === 0) return;

    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.matches) {
          setMatches(data.matches);
          matchesRef.current = data.matches;
          await loadGames(data.matches);
        }
        try {
          const st = await fetch(`/api/tournaments/${tournamentId}/standings`);
          if (st.ok) setStandings(await st.json());
        } catch {
          // best-effort
        }
      }
    } catch (err) {
      // Silently fail
    }
  }

  async function loadGames(matchList?: Match[]) {
    const list = matchList || matches;
    const mids = list.map((m) => m.id);
    if (mids.length === 0) return;

    try {
      const g: Record<string, Game[]> = {};
      for (const m of list) {
        const res = await fetch(`/api/matches/${m.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.games) {
            g[m.id] = data.games;
          }
        }
      }
      setGamesByMatch(g);
    } catch (err) {
      console.error("Load games error:", err);
    }
  }

  function latestGame(mid: string): Game | null {
    const g = gamesByMatch[mid];
    if (!g || g.length === 0) return null;
    return g[g.length - 1];
  }

  // games come from /api/matches/[id] which maps: score_entry_1/score_entry_2, status, winner_id
  function liveScore(mid: string, side: 1 | 2): number | null {
    const g = latestGame(mid);
    if (!g || g.status === "completed") return null; // only show live points during play
    return side === 1 ? g.score_entry_1 : g.score_entry_2;
  }

  // Count completed games won by each side
  function setsWon(mid: string, side: 1 | 2, match?: Match): number {
    const g = gamesByMatch[mid] || [];
    if (!match) return 0;
    const target = side === 1 ? match.entry_1_id : match.entry_2_id;
    return g.filter((x) => x.status === "completed" && x.winner_id === target).length;
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

  // DB status values: scheduled / in_progress / completed / walkover / cancelled
  const live = filtered.filter((m) => m.status === "in_progress" || m.status === "playing");
  const upcoming = filtered.filter((m) => m.status === "scheduled");
  const done = filtered.filter((m) => m.status === "completed" || m.status === "walkover");

  // ---- Bracket rendering ----
  function bracketRounds(catId: string) {
    const catMatches = matches.filter((m) => m.category_id === catId);
    const roundsMap = new Map<string, Match[]>();
    for (const m of catMatches) {
      const key = m.round || "R32";
      if (!roundsMap.has(key)) roundsMap.set(key, []);
      roundsMap.get(key)!.push(m);
    }
    const rounds = Array.from(roundsMap.entries())
      .map(([label, ms]) => ({ label, rank: roundRank(label), matches: ms }))
      .sort((a, b) => a.rank - b.rank);
    return rounds;
  }

  const bracketCats = categories.filter((c) => matches.some((m) => m.category_id === c.id));

  const statusPill = (s?: string) => {
    if (!s) return null;
    if (s === "in_progress" || s === "live")
      return (
        <span className="inline-flex items-center gap-1.5 bg-red-100 text-red-700 text-xs font-bold px-3 py-1 rounded-full mt-1">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>LIVE
        </span>
      );
    if (s === "registration")
      return <span className="inline-flex items-center bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full mt-1">Registration Open</span>;
    if (s === "published")
      return <span className="inline-flex items-center bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full mt-1">OPEN</span>;
    if (s === "completed")
      return <span className="inline-flex items-center bg-gray-200 text-gray-600 text-xs font-bold px-3 py-1 rounded-full mt-1">COMPLETED</span>;
    return <span className="inline-flex items-center bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full mt-1">Upcoming</span>;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <Link href="/" className="text-emerald-300 text-sm hover:underline">← Home</Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold mt-2">{tournament?.title || tournament?.name || 'Tournament'}</h1>
              <p className="text-emerald-200 text-sm mt-1">
                {tournament?.start_date ? new Date(tournament.start_date).toLocaleDateString() : ""}
                {tournament?.end_date ? ` — ${new Date(tournament.end_date).toLocaleDateString()}` : ""}
              </p>
              {statusPill(tournament?.status)}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowQR(true)}
                className="bg-emerald-700/60 border border-emerald-400/40 text-white font-semibold px-4 py-3 rounded-xl hover:bg-emerald-600/60 transition-all">
                📱 QR
              </button>
              {(tournament?.status === "registration" || tournament?.status === "published" || tournament?.status === "draft") && (
                <button onClick={() => { setRegMsg(null); setShowRegister(true); }}
                  className="bg-white text-emerald-900 font-bold px-6 py-3 rounded-xl hover:bg-emerald-50 transition-all">
                  + Join Tournament
                </button>
              )}
            </div>
          </div>

          {/* TUA11: persistent inline registration status (not alert()-only) */}
          {regMsg && regMsg.kind === "ok" && (
            <div className="mt-4 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium">
              ✅ {regMsg.text}
            </div>
          )}

          {/* View switcher */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setView("matches")}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                view === "matches" ? "bg-white text-emerald-900" : "bg-emerald-800 text-emerald-100 hover:bg-emerald-700"
              }`}
            >
              🏸 Matches
            </button>
            <button
              onClick={() => setView("bracket")}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                view === "bracket" ? "bg-white text-emerald-900" : "bg-emerald-800 text-emerald-100 hover:bg-emerald-700"
              }`}
            >
              🏆 Bracket
            </button>
          </div>
        </div>
      </div>

      {/* QR Access Modal */}
      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowQR(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-800">📱 Scan to Follow Live</h3>
              <button onClick={() => setShowQR(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="bg-white p-3 rounded-xl border-2 border-emerald-100 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/qr?url=${encodeURIComponent(window.location.href)}&size=320`}
                alt="QR code"
                width={256}
                height={256}
                className="w-64 h-64"
              />
            </div>
            <p className="text-center text-sm text-gray-500 mt-3">
              Scan with your phone camera to open the live scoreboard &amp; brackets
            </p>
            <div className="mt-4 bg-gray-50 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="text-xs text-gray-500 truncate flex-1">{typeof window !== "undefined" ? window.location.href : ""}</span>
              <button
                onClick={() => { if (navigator.clipboard) navigator.clipboard.writeText(window.location.href); }}
                className="text-emerald-700 text-xs font-bold hover:underline shrink-0"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}

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
                      <p className="text-sm text-gray-400">{cat.type} · {cat.scoring_config?.points_per_game}pts</p>
                    </div>
                    <button onClick={async () => {
                      if (!user) {
                        setShowLoginPrompt(true);
                        return;
                      }
                      try {
                        setRegMsg(null);
                        const res = await fetch(`/api/tournament_registrations`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            tournament_id: tournamentId,
                            category_id: cat.id,
                          }),
                        });
                        if (res.ok) {
                          setRegMsg({
                            kind: "ok",
                            text: "Registration submitted! Your entry is now pending organizer approval.",
                          });
                          setShowRegister(false);
                        } else {
                          const err = await res.json();
                          setRegMsg({ kind: "err", text: (err && err.error) || "Failed to register" });
                        }
                      } catch {
                        setRegMsg({ kind: "err", text: "Failed to register. Please try again." });
                      }
                    }}
                    className="bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600">
                      Register
                    </button>
                  </div>
                )) : <p className="text-gray-400">No categories available</p>}
              </div>
              {regMsg && (
                <div className={`mt-3 px-4 py-3 rounded-xl text-sm font-medium ${
                  regMsg.kind === "ok"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}>
                  {regMsg.text}
                </div>
              )}
              <button onClick={() => setShowRegister(false)}
                className="w-full mt-4 py-3 border border-gray-200 rounded-xl text-gray-600 font-medium">Cancel</button>
            </div>
          </div>
        )}

        {view === "matches" ? (
          <>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Find my match..."
              className="w-full px-4 sm:px-6 py-3 sm:py-4 rounded-2xl border border-gray-200 shadow-sm text-base sm:text-lg focus:ring-2 focus:ring-emerald-500 mb-5 sm:mb-6" />

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
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
                  <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" /> LIVE
                </h2>
                {live.map((m) => {
                  const g = latestGame(m.id);
                  return (
                    <div key={m.id} className="bg-white rounded-2xl p-4 sm:p-5 shadow-md border-l-4 border-red-500 mb-4">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs sm:text-sm font-medium text-gray-500 min-w-0 truncate">{catName(m.category_id)} · {m.court_name || `Court ${m.court_number || ((m.match_number % 10) + 1)}`}</span>
                        <span className="text-xs text-gray-400 shrink-0">{m.round}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0 font-bold text-base sm:text-lg text-gray-900 truncate">{entryName(m.entry_1_id, entries)}</div>
                        <div className="flex items-center gap-2 sm:gap-4 mx-2 sm:mx-4 shrink-0">
                          <div className="text-2xl sm:text-3xl font-black text-emerald-700">{g?.score_entry_1 ?? 0}</div>
                          <div className="text-lg sm:text-xl font-bold text-gray-300">:</div>
                          <div className="text-2xl sm:text-3xl font-black text-blue-700">{g?.score_entry_2 ?? 0}</div>
                        </div>
                        <div className="flex-1 min-w-0 font-bold text-base sm:text-lg text-gray-900 text-right truncate">{entryName(m.entry_2_id, entries)}</div>
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
                  <div key={m.id} className="bg-white rounded-xl p-3 sm:p-4 border border-gray-200 flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                      <span className="text-gray-400 font-mono text-xs sm:text-sm shrink-0">{m.court_name || `C${m.court_number || ((m.match_number % 10) + 1)}`}</span>
                      <span className="font-medium text-gray-900 text-sm sm:text-base min-w-0 truncate">{entryName(m.entry_1_id, entries)}</span>
                      <span className="text-gray-400 text-sm shrink-0">vs</span>
                      <span className="font-medium text-gray-900 text-sm sm:text-base min-w-0 truncate">{entryName(m.entry_2_id, entries)}</span>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{m.round}</span>
                  </div>
                ))}
              </div>
            )}

            {done.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-3">Results</h2>
                {done.map((m) => (
                  <div key={m.id} className="bg-white rounded-xl p-3 sm:p-4 border border-gray-200 flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                      <span className="text-gray-400 font-mono text-xs sm:text-sm shrink-0">{m.round}</span>
                      <span className={`font-medium ${m.winner_entry_id === m.entry_1_id ? "text-emerald-700 font-bold" : "text-gray-600"}`}>
                        {entryName(m.entry_1_id, entries)}
                      </span>
                      <span className="text-gray-300">-</span>
                      <span className={`font-medium ${m.winner_entry_id === m.entry_2_id ? "text-emerald-700 font-bold" : "text-gray-600"}`}>
                        {entryName(m.entry_2_id, entries)}
                      </span>
                    </div>
                    {m.winner_entry_id && <span className="text-emerald-700 text-xs font-medium">Winner</span>}
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
          </>
        ) : (
          /* ===== BRACKET VIEW ===== */
          <div>
            {bracketCats.length === 0 && (
              <div className="text-center py-20 text-gray-400">
                <div className="text-6xl mb-4">🏆</div>
                <p className="text-xl">No bracket available yet</p>
              </div>
            )}
            {bracketCats.map((cat) => {
              const rounds = bracketRounds(cat.id);
              const catStand = standings?.categories?.find((c: any) => c.category_id === cat.id);
              const isGK = catStand?.format === 'group_knockout';
              const format = catStand?.format;
              const isTreeFormat = format === 'knockout' || format === 'group_knockout' || format === 'protected';
              const catMatches = matches.filter((m) => m.category_id === cat.id);
              const treeMatches = isGK ? catMatches.filter((m: any) => m.bracket_group === 'ko') : catMatches;
              const koAwaiting = isGK && !!catStand?.ko?.awaiting;
              const koBadges: Record<string, string> = catStand?.ko?.badges || {};
              const koMatches = matches.filter((m) => m.category_id === cat.id && m.bracket_group === 'ko');
              const firstKoRound = koMatches
                .slice()
                .sort((a, b) => roundRank(a.round) - roundRank(b.round))[0]?.round || null;
              const isKoR1 = (m: Match) => m.round === firstKoRound;
              return (
                <div key={cat.id} className="mb-10">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <span className="text-emerald-700">🏆</span> {cat.name}
                    <span className="text-sm font-normal text-gray-400">({matches.filter((m) => m.category_id === cat.id).length} matches)</span>
                  </h2>
                  {isGK && (
                    <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {(catStand.groups || []).map((g: any) => (
                        <div key={g.label} className="bg-white rounded-xl border border-gray-200 p-3">
                          <h3 className="text-sm font-bold text-gray-700 mb-2">Group {g.label}</h3>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                                <th className="py-1 pr-1">#</th>
                                <th className="py-1">Player</th>
                                <th className="py-1 text-center">W-L</th>
                                <th className="py-1 text-center">Sets</th>
                                <th className="py-1 text-center">Pts</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.entries.map((r: any) => (
                                <tr key={r.entry_id} className="border-b border-gray-50 last:border-0">
                                  <td className="py-1 pr-1 font-bold text-gray-400">{r.rank}</td>
                                  <td className="py-1 font-medium text-gray-800 truncate max-w-[110px]">
                                    {r.name}
                                    {r.withdrawn && <span className="text-[10px] text-red-400 ml-1">(WD)</span>}
                                  </td>
                                  <td className="py-1 text-center text-gray-700">{r.wins}-{r.losses}</td>
                                  <td className="py-1 text-center text-gray-500">{r.set_diff > 0 ? `+${r.set_diff}` : r.set_diff}</td>
                                  <td className="py-1 text-center text-gray-500">{r.points_diff > 0 ? `+${r.points_diff}` : r.points_diff}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>
                  )}
                  {isGK && koAwaiting && (
                    <div className="mb-4 text-xs font-bold bg-amber-100 text-amber-700 px-3 py-2 rounded-lg inline-block animate-pulse">
                      ⏳ Knockout bracket awaiting group results…
                    </div>
                  )}
                  {isTreeFormat ? (
                    <BracketView
                      matches={treeMatches.map((m: any) => {
                        const gs = gamesByMatch[m.id] || [];
                        const en: any = { ...m };
                        for (let i = 0; i < gs.length && i < 3; i++) {
                          en[`game${i + 1}_1`] = gs[i].score_entry_1 ?? 0;
                          en[`game${i + 1}_2`] = gs[i].score_entry_2 ?? 0;
                        }
                        return en;
                      })}
                      getPlayerName={(eid: string | null) => entryName(eid, entries)}
                      courtLabel={(m: any) => m.court_name || (m.court_number ? `Court ${m.court_number}` : "")}
                      entryBadges={koBadges}
                      awaitingGroupResults={koAwaiting}
                    />
                  ) : (
                  <div className="overflow-x-auto pb-4">
                    <div className="flex gap-6 min-w-max items-start">
                      {rounds.map((round) => (
                        <div key={round.label} className="flex flex-col gap-4 min-w-[210px]">
                          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider text-center mb-1">
                            {round.label}
                          </div>
                          {round.matches.map((m) => {
                            const w1 = m.winner_entry_id === m.entry_1_id;
                            const w2 = m.winner_entry_id === m.entry_2_id;
                            const isLive = m.status === "in_progress" || m.status === "playing";
                            const s1 = liveScore(m.id, 1);
                            const s2 = liveScore(m.id, 2);
                            const sets1 = setsWon(m.id, 1, m);
                            const sets2 = setsWon(m.id, 2, m);
                            return (
                              <div key={m.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
                                isLive ? "border-red-400 ring-2 ring-red-100" :
                                m.status === "completed" || m.status === "walkover" ? "border-gray-200" : "border-dashed border-gray-300"
                              }`}>
                                {/* Player 1 */}
                                <div className={`flex items-center justify-between px-3 py-2 ${
                                  w1 ? "bg-emerald-50" : m.status === "completed" || m.status === "walkover" ? "opacity-50" : ""
                                }`}>
                                  <span className="text-sm font-semibold text-gray-800 truncate flex items-center gap-1 min-w-0">
                                    {w1 && <span className="text-emerald-600 mr-1">✓</span>}
                                    {isGK && m.entry_1_id && koBadges[m.entry_1_id] && (
                                      <span className="text-[9px] font-bold bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded shrink-0">{koBadges[m.entry_1_id]}</span>
                                    )}
                                    {isGK && koAwaiting && isKoR1(m) && !m.entry_1_id ? (
                                      <span className="italic text-gray-300">Awaiting group results</span>
                                    ) : (
                                      entryName(m.entry_1_id, entries)
                                    )}
                                  </span>
                                  <span className="flex items-center gap-1 ml-2 shrink-0">
                                    {m.status === "completed" || m.status === "walkover" ? (
                                      <span className={`text-sm font-bold ${w1 ? "text-emerald-700" : "text-gray-400"}`}>{sets1}</span>
                                    ) : isLive && s1 !== null ? (
                                      <span className="text-sm font-bold text-red-500">{s1}</span>
                                    ) : null}
                                  </span>
                                </div>
                                <div className="border-t border-gray-100" />
                                {/* Player 2 */}
                                <div className={`flex items-center justify-between px-3 py-2 ${
                                  w2 ? "bg-emerald-50" : m.status === "completed" || m.status === "walkover" ? "opacity-50" : ""
                                }`}>
                                  <span className="text-sm font-semibold text-gray-800 truncate flex items-center gap-1 min-w-0">
                                    {w2 && <span className="text-emerald-600 mr-1">✓</span>}
                                    {isGK && m.entry_2_id && koBadges[m.entry_2_id] && (
                                      <span className="text-[9px] font-bold bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded shrink-0">{koBadges[m.entry_2_id]}</span>
                                    )}
                                    {isGK && koAwaiting && isKoR1(m) && !m.entry_2_id ? (
                                      <span className="italic text-gray-300">Awaiting group results</span>
                                    ) : (
                                      entryName(m.entry_2_id, entries)
                                    )}
                                  </span>
                                  <span className="flex items-center gap-1 ml-2 shrink-0">
                                    {m.status === "completed" || m.status === "walkover" ? (
                                      <span className={`text-sm font-bold ${w2 ? "text-emerald-700" : "text-gray-400"}`}>{sets2}</span>
                                    ) : isLive && s2 !== null ? (
                                      <span className="text-sm font-bold text-red-500">{s2}</span>
                                    ) : null}
                                  </span>
                                </div>
                                {isLive && (
                                  <div className="bg-red-500 text-white text-[10px] font-bold text-center py-0.5 animate-pulse">
                                    ● LIVE
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Login Prompt Modal */}
      {showLoginPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center">
            <div className="text-5xl mb-4">🔐</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Sign in Required</h2>
            <p className="text-gray-500 mb-6">Please sign in to register for this tournament.</p>
            <Link href="/auth/login"
              className="block w-full bg-emerald-700 text-white py-3 rounded-xl font-bold hover:bg-emerald-600 mb-3">
              Sign In
            </Link>
            <button onClick={() => setShowLoginPrompt(false)}
              className="w-full py-3 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
