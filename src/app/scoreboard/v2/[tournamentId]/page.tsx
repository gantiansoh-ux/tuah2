"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";

interface CourtState {
  teamA: string;
  teamB: string;
  score1: number;
  score2: number;
  set1: number;
  set2: number;
  category: string;
  status: "idle" | "active" | "completed";
  winner: string;
}

interface MatchData {
  id: string;
  match_number: number;
  round: string;
  court_number: number | null;
  winner_entry_id?: string | null;
  entry_1_id: string | null;
  entry_2_id: string | null;
  status: string;
  category_name?: string;
  teamA?: string;
  teamB?: string;
  score1?: number;
  score2?: number;
  set1?: number;
  set2?: number;
}

export default function LiveScoreboardV2Page({
  params,
}: {
  params: { tournamentId: string };
}) {
  const { tournamentId } = params;

  const [tournamentName, setTournamentName] = useState("Loading...");
  const [courts, setCourts] = useState<Record<string, CourtState>>({});
  const [courtKeys, setCourtKeys] = useState<string[]>([]);
  const [numCourts, setNumCourts] = useState(4);
  const [connStatus, setConnStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const score1Refs = useRef<Record<string, HTMLDivElement | null>>({});
  const score2Refs = useRef<Record<string, HTMLDivElement | null>>({});
  const prevScoresRef = useRef<Record<string, { s1: number; s2: number }>>({});

  // Fetch tournament + poll matches
  useEffect(() => {
    if (!tournamentId) return;
    loadTournament();

    const interval = setInterval(refreshData, 3000);
    return () => clearInterval(interval);
  }, [tournamentId]);

  function matchOnCourtFn(matches: MatchData[], court: number): MatchData | undefined {
    // Prefer live/in-progress, then scheduled, ignore completed
    return matches.find(
      (m) => m.court_number === court && (m.status === "in_progress" || m.status === "playing")
    ) || matches.find(
      (m) => m.court_number === court && m.status !== "completed"
    );
  }

  async function loadTournament() {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      const t = data.tournament;
      setTournamentName(t.name || "TUAH Hawkeye");
      setNumCourts(t.number_of_courts || 4);
      setConnStatus("connected");

      // Init courts
      const keys = Array.from({ length: t.number_of_courts || 4 }, (_, i) => String(i + 1));
      setCourtKeys(keys);

      const courtInit: Record<string, CourtState> = {};
      keys.forEach((k) => {
        const matchOnCourt = matchOnCourtFn(data.matches || [], parseInt(k));
        if (matchOnCourt) {
          courtInit[k] = buildCourtStateFromMatch(matchOnCourt, data.games || [], data.entries || []);
        } else {
          courtInit[k] = emptyCourt(keys.length > 4);
        }
      });
      setCourts(courtInit);
    } catch {
      setTournamentName("TUAH Hawkeye");
      setConnStatus("disconnected");
    }
  }

  async function refreshData() {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`);
      if (!res.ok) return;
      const data = await res.json();
      const matches: MatchData[] = data.matches || [];
      const games = data.games || [];

      setNumCourts(data.tournament.number_of_courts || 4);

      setCourts((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((k) => {
          const matchOnCourt = matchOnCourtFn(matches, parseInt(k));
          if (matchOnCourt) {
            const newState = buildCourtStateFromMatch(matchOnCourt, games, data.entries || []);
            const prevScores = prevScoresRef.current[`c${k}`];
            const s1Changed = !prevScores || prevScores.s1 !== newState.score1;
            const s2Changed = !prevScores || prevScores.s2 !== newState.score2;

            // Flash animation
            const s1El = score1Refs.current[`c${k}-s1`];
            if (s1El && s1Changed && prevScores) {
              s1El.classList.add("text-blue-300");
              setTimeout(() => s1El.classList.remove("text-blue-300"), 300);
            }
            const s2El = score2Refs.current[`c${k}-s2`];
            if (s2El && s2Changed && prevScores) {
              s2El.classList.add("text-red-300");
              setTimeout(() => s2El.classList.remove("text-red-300"), 300);
            }

            prevScoresRef.current[`c${k}`] = { s1: newState.score1, s2: newState.score2 };
            updated[k] = newState;

            // If previously idle, status=active
            if (prev[k]?.status === "idle") {
              updated[k].status = "active";
            }
          } else {
            // Check if match was completed
            const completedMatch = matches.find(
              (m: MatchData) => m.court_number === parseInt(k) && m.status === "completed"
            );
            if (completedMatch) {
              const completed = buildCourtStateFromMatch(completedMatch, games, data.entries || []);
              completed.status = "completed";
              completed.category = `MATCH COMPLETED - ${(completed.winner || "").toUpperCase()} WINS`;
              updated[k] = completed;
            } else if (!prev[k] || prev[k].status !== "idle") {
              updated[k] = emptyCourt(numCourts > 4);
            }
          }
        });
        return updated;
      });
    } catch {
      setConnStatus("disconnected");
    }
  }

  function getPlayerName(entryId: string | null, entries: any[]): string {
    if (!entryId) return "TBD";
    const e = entries.find((x: any) => x.id === entryId);
    if (!e) return entryId.slice(0, 8);
    return e.player_1_name || e.player_1_id?.slice(0, 8) || entryId.slice(0, 8);
  }

  function buildCourtStateFromMatch(match: MatchData, games: any[], entries: any[]): CourtState {
    const matchGames = games.filter((g: any) => g.match_id === match.id);
    // Sets won by each side: count completed games where winner_id matches that entry
    const set1 = matchGames.filter((g: any) => g.is_complete && g.winner_id && g.winner_id === match.entry_1_id).length;
    const set2 = matchGames.filter((g: any) => g.is_complete && g.winner_id && g.winner_id === match.entry_2_id).length;

    // Get latest game scores (DB column: score_1, score_2)
    let score1 = 0, score2 = 0;
    const latestGame = [...matchGames].sort((a: any, b: any) => b.game_number - a.game_number)[0];
    if (latestGame) {
      score1 = latestGame.score_1 || 0;
      score2 = latestGame.score_2 || 0;
    }

    const pA = getPlayerName(match.entry_1_id, entries);
    const pB = getPlayerName(match.entry_2_id, entries);

    const winner = match.status === "completed" && match.winner_entry_id
      ? (match.winner_entry_id === match.entry_1_id ? pA : pB)
      : "";

    return {
      teamA: pA,
      teamB: pB,
      score1,
      score2,
      set1,
      set2,
      category: (match.category_name || "").toUpperCase() || "MATCH",
      status: match.status === "completed" ? "completed" : "active",
      winner,
    };
  }

  function emptyCourt(small: boolean): CourtState {
    return {
      teamA: "Team A",
      teamB: "Team B",
      score1: 0, score2: 0,
      set1: 0, set2: 0,
      category: small ? "WAITING" : "WAITING FOR DISPATCH...",
      status: "idle",
      winner: "",
    };
  }

  // Dynamic grid
  const gridCols = numCourts <= 2 ? 1 : numCourts <= 4 ? 2 : numCourts <= 6 ? 3 : Math.ceil(Math.sqrt(numCourts));
  const gridRows = Math.ceil(numCourts / gridCols);
  const isSmall = numCourts > 4;

  const connDot: Record<string, string> = {
    connecting: "bg-yellow-500",
    connected: "bg-green-500",
    disconnected: "bg-red-500",
  };
  const connText: Record<string, string> = {
    connecting: "Connecting Server...",
    connected: "Polling Live",
    disconnected: "Disconnected",
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <div className="h-10 md:h-12 bg-black flex justify-between items-center px-4 md:px-6 border-b border-gray-800 shadow-xl z-10 shrink-0">
        <div className="flex items-center min-w-0">
          <span className="bg-red-600 px-2 py-0.5 rounded text-[10px] md:text-xs font-bold animate-pulse mr-2 text-white shrink-0">
            LIVE
          </span>
          <span className="font-black tracking-widest text-gray-200 text-sm md:text-base truncate">
            {tournamentName.toUpperCase()}
          </span>
          <span className="hidden md:inline text-gray-600 text-[10px] ml-2 font-mono">
            ({numCourts} COURTS)
          </span>
        </div>
        <div className="flex items-center gap-1.5 md:gap-2 text-gray-600 font-mono text-[10px] md:text-xs shrink-0">
          <span className={`w-2 h-2 ${connDot[connStatus]} rounded-full`}></span>
          <span>{connText[connStatus]}</span>
        </div>
      </div>

      {/* Dynamic Court Grid */}
      <div
        className="flex-1 gap-[1px] bg-gray-800"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          gridTemplateRows: `repeat(${gridRows}, 1fr)`,
        }}
      >
        {courtKeys.map((courtKey) => {
          const court = courts[courtKey];
          if (!court) return null;

          const opacity =
            court.status === "idle" ? "opacity-30"
            : court.status === "completed" ? "opacity-40"
            : "opacity-100";
          const bgGlow = court.status === "active" ? "shadow-[inset_0_0_80px_rgba(255,255,255,0.03)]" : "";

          const nameSize = isSmall ? "text-[10px] md:text-3xl" : "text-xs md:text-5xl";
          const scoreSize = isSmall ? "text-4xl md:text-8xl" : "text-6xl md:text-9xl";
          const setLabelSize = isSmall ? "text-[8px] md:text-sm" : "text-[10px] md:text-base";
          const setValSize = isSmall ? "text-xs md:text-lg" : "text-sm md:text-xl";
          const courtLabel = isSmall ? "text-[10px] md:text-lg" : "text-xs md:text-xl";
          const catSize = isSmall ? "text-[8px] md:text-xs" : "text-[10px] md:text-sm";

          return (
            <div
              key={courtKey}
              className={`bg-black flex flex-col relative p-1 md:p-4 transition-all duration-300 ${opacity} ${bgGlow}`}
            >
              {/* Court Number */}
              <div className={`absolute top-1 md:top-4 left-1 md:left-4 text-gray-500 font-bold tracking-widest ${courtLabel}`}>
                COURT {courtKey}
              </div>

              {/* Category */}
              <div className={`text-indigo-400 font-bold mb-0.5 md:mb-4 text-center mt-2 md:mt-6 tracking-widest h-3 md:h-6 ${catSize}`}>
                {court.category}
              </div>

              {/* Score Area */}
              <div className="flex-1 flex justify-around items-center px-0.5 md:px-2">
                {/* Player A */}
                <div className="flex flex-col items-center w-1/3">
                  <div className={`text-blue-400 font-bold ${nameSize} mb-0.5 md:mb-2 uppercase text-center min-h-6 md:min-h-16 block truncate w-full leading-tight`} title={court.teamA}>
                    {court.teamA}
                  </div>
                  <div className={`text-gray-500 ${setLabelSize} font-bold tracking-widest mb-0.5 md:mb-1`}>
                    SETS: <span className={`text-white ${setValSize}`}>{court.set1}</span>
                  </div>
                  <div
                    ref={(el) => { score1Refs.current[`c${courtKey}-s1`] = el; }}
                    className={`text-white ${scoreSize} font-black bg-gray-900 px-2 md:px-6 py-0.5 md:py-2 rounded md:rounded-xl border border-blue-900 md:border-2 leading-none transition-colors duration-150`}
                  >
                    {court.score1}
                  </div>
                </div>

                {/* VS */}
                <div className="flex flex-col items-center justify-center h-full px-0.5 md:px-2 w-1/6">
                  <div className="w-px h-4 md:h-16 bg-gray-800 rounded-full"></div>
                  <div className={`${isSmall ? "text-[10px] md:text-xl" : "text-xs md:text-2xl"} font-bold text-gray-600 my-1 md:my-4`}>VS</div>
                  <div className="w-px h-4 md:h-16 bg-gray-800 rounded-full"></div>
                </div>

                {/* Player B */}
                <div className="flex flex-col items-center w-1/3">
                  <div className={`text-red-400 font-bold ${nameSize} mb-0.5 md:mb-2 uppercase text-center min-h-6 md:min-h-16 block truncate w-full leading-tight`} title={court.teamB}>
                    {court.teamB}
                  </div>
                  <div className={`text-gray-500 ${setLabelSize} font-bold tracking-widest mb-0.5 md:mb-1`}>
                    SETS: <span className={`text-white ${setValSize}`}>{court.set2}</span>
                  </div>
                  <div
                    ref={(el) => { score2Refs.current[`c${courtKey}-s2`] = el; }}
                    className={`text-white ${scoreSize} font-black bg-gray-900 px-2 md:px-6 py-0.5 md:py-2 rounded md:rounded-xl border border-red-900 md:border-2 leading-none transition-colors duration-150`}
                  >
                    {court.score2}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
