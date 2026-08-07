"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Match, Game, Category, ScoringConfig } from "@/lib/types";
import { checkGameOver, checkMatchOver } from "@/lib/scoring";

type Side = "left" | "right";
type Phase = "setup" | "coin_toss" | "playing" | "game_over" | "match_over";

async function api(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export default function UmpirePadPage({
  params,
}: {
  params: { matchId: string };
}) {
  const { matchId } = params;
  const router = useRouter();

  const [match, setMatch] = useState<Match | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [config, setConfig] = useState<ScoringConfig>({ points_per_game: 21, best_of: 3, deuce: true });
  const [phase, setPhase] = useState<Phase>("setup");
  const [currentGameIdx, setCurrentGameIdx] = useState(0);
  const [serveSide, setServeSide] = useState<Side>("left");
  const [cardConfirm, setCardConfirm] = useState<string | null>(null);
  const [redCardStep2, setRedCardStep2] = useState(false);
  const [undoStack, setUndoStack] = useState<any[]>([]);

  const currentGame = games[currentGameIdx];
  const score1 = currentGame?.score_entry_1 ?? 0;
  const score2 = currentGame?.score_entry_2 ?? 0;
  // FIX(#51-pad): count wins by REAL entry ids, not literal "entry_1"/"entry_2"
  const p1Wins = games.filter((g) => g.winner_id === match?.entry_1_id).length;
  const p2Wins = games.filter((g) => g.winner_id === match?.entry_2_id).length;
  const needed = Math.ceil(config.best_of / 2);
  const name1 = match?.player_1_name || "Player 1";
  const name2 = match?.player_2_name || "Player 2";

  useEffect(() => {
    loadMatch();
  }, [matchId]);

  async function loadMatch() {
    try {
      const data = await api(`/api/matches/${matchId}`);
      const matchData = data.match as Match;
      setMatch(matchData);

      if (data.category) {
        setConfig(data.category.scoring_config || config);
      }

      const gamesData = data.games || [];
      if (gamesData.length === 0) {
        // Create first game
        const gameRes = await api(`/api/games/create`, {
          method: "POST",
          body: JSON.stringify({ match_id: matchId, game_number: 1 }),
        });
        setGames([gameRes.game]);
        setPhase("coin_toss");
      } else {
        setGames(gamesData);
        const lastGame = gamesData[gamesData.length - 1];
        if (lastGame.status === "completed") {
          setPhase("match_over");
        } else {
          setCurrentGameIdx(gamesData.length - 1);
          setPhase("playing");
        }
      }

      // Set match to playing
      await api(`/api/matches/${matchId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "playing" }),
      });
    } catch (err) {
      console.error("Load match error:", err);
    }
  }

  async function startNextGame() {
    const gameRes = await api(`/api/games/create`, {
      method: "POST",
      body: JSON.stringify({ match_id: matchId, game_number: currentGameIdx + 1 }),
    });
    setGames([...games, gameRes.game]);
    setPhase("playing");
  }

  async function scorePoint(player: 1 | 2) {
    if (!currentGame || phase === "game_over" || phase === "match_over") return;

    const newScore1 = player === 1 ? score1 + 1 : score1;
    const newScore2 = player === 2 ? score2 + 1 : score2;

    // Save undo state
    setUndoStack([...undoStack, {
      gameId: currentGame.id,
      score1, score2,
      gameNumber: currentGame.game_number,
      gameStatus: currentGame.status,
      gameWinner: currentGame.winner_id,
    }]);

    const result = checkGameOver(newScore1, newScore2, config);

    if (result.isGameOver) {
      // FIX(#51-pad): send REAL entry uuid as winner_id (literal "entry_1" → PG uuid error → 500)
      const winnerId = result.winner === "player1" ? match!.entry_1_id : match!.entry_2_id;
      const prevGames = games
        .filter((g) => g.id !== currentGame.id)
        .map((g) => ({
          game_number: g.game_number,
          winner: g.winner_id === match!.entry_1_id ? "player1" as const : g.winner_id === match!.entry_2_id ? "player2" as const : null,
        }));
      const isMatchDone = checkMatchOver(
        [...prevGames, {
          game_number: currentGame.game_number,
          winner: result.winner,
        }],
        config
      );

      // Update current game as completed
      await api(`/api/games/update`, {
        method: "POST",
        body: JSON.stringify({
          id: currentGame.id,
          score_entry_1: newScore1,
          score_entry_2: newScore2,
          status: "completed",
          winner_id: winnerId,
        }),
      });

      setGames(games.map((g) =>
        g.id === currentGame.id
          ? { ...g, score_entry_1: newScore1, score_entry_2: newScore2, status: "completed", winner_id: winnerId }
          : g
      ));

      if (isMatchDone.isMatchOver) {
        const matchWinnerId = isMatchDone.winner === "player1" ? match!.entry_1_id : match!.entry_2_id;
        // FIX(#51-pad): API field is winner_entry_id (winner_id is ignored → winner never saved)
        await api(`/api/matches/${matchId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "completed", winner_entry_id: matchWinnerId }),
        });
        setMatch(m => m ? { ...m, status: "completed", winner_entry_id: matchWinnerId } : m);
        setPhase("match_over");
      } else {
        setPhase("game_over");
        setCurrentGameIdx(currentGameIdx + 1);
        setServeSide(serveSide === "left" ? "right" : "left");
      }
    } else {
      await api(`/api/games/update`, {
        method: "POST",
        body: JSON.stringify({
          id: currentGame.id,
          score_entry_1: newScore1,
          score_entry_2: newScore2,
          current_server: player,
        }),
      });

      setGames(games.map((g) =>
        g.id === currentGame.id
          ? { ...g, score_entry_1: newScore1, score_entry_2: newScore2, current_server: player }
          : g
      ));
    }
  }

  async function handleUndo() {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack(undoStack.slice(0, -1));

    await api(`/api/games/update`, {
      method: "POST",
      body: JSON.stringify({
        id: last.gameId,
        score_entry_1: last.score1,
        score_entry_2: last.score2,
        status: "playing",
        winner_id: null,
      }),
    });

    setGames(games.map((g) =>
      g.id === last.gameId
        ? { ...g, score_entry_1: last.score1, score_entry_2: last.score2, status: "playing", winner_id: null }
        : g
    ));

    // FIX(#51-pad): currentGame may be undefined between games — compare safely
    if (last.gameNumber !== (currentGame?.game_number ?? -1)) {
      setCurrentGameIdx(last.gameNumber - 1);
    }
    setPhase("playing");
  }

  async function handleFault(player: "entry_1" | "entry_2") {
    if (!currentGame) return;
    // FIX(#51-pad): send REAL entry uuid as scoring_entry_id (literal → PG uuid error → 500)
    const entryId = player === "entry_1" ? match!.entry_1_id : match!.entry_2_id;
    await api(`/api/point_logs`, {
      method: "POST",
      body: JSON.stringify({
        game_id: currentGame.id,
        match_id: matchId,
        scoring_entry_id: entryId,
        action: "fault",
        point_type: "fault",
      }),
    });
    alert(`⚠️ Fault called on ${player === "entry_1" ? name1 : name2}`);
  }

  async function handleCard(type: string) {
    if (type === "yellow") {
      setCardConfirm("yellow");
    } else {
      if (!cardConfirm) setCardConfirm("red");
      else if (!redCardStep2) setRedCardStep2(true);
      else {
        await executeCard("red");
        setCardConfirm(null);
        setRedCardStep2(false);
      }
    }
  }

  async function executeCard(type: string) {
    const playerId = match?.entry_1_id || "unknown";
    await api(`/api/card_logs`, {
      method: "POST",
      body: JSON.stringify({
        match_id: matchId,
        entry_id: playerId,
        card_type: type,
        reason: "",
      }),
    });
    if (type === "red") {
      await api(`/api/matches/${matchId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      });
      setMatch(m => m ? { ...m, status: "completed" } : m);
      setPhase("match_over");
    }
    setCardConfirm(null);
    alert(`🟨 ${type.toUpperCase()} card issued`);
  }

  if (!match) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" /></div>;

  // Coin Toss
  if (phase === "coin_toss") {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8">
        <h1 className="text-3xl font-black mb-8">🎯 Choose Side</h1>
        <p className="text-gray-400 mb-8 text-center">Winning player chooses left or right court</p>
        <div className="flex gap-6">
          <button onClick={() => { setServeSide("left"); setPhase("playing"); }} className="bg-emerald-700 text-white px-12 py-6 rounded-2xl text-2xl font-bold hover:bg-emerald-600">← Left</button>
          <button onClick={() => { setServeSide("right"); setPhase("playing"); }} className="bg-blue-700 text-white px-12 py-6 rounded-2xl text-2xl font-bold hover:bg-blue-600">Right →</button>
        </div>
      </div>
    );
  }

  // Game Over
  if (phase === "game_over") {
    // FIX(#51-pad): show the game that JUST completed (currentGameIdx already advanced)
    const justWon = games[currentGameIdx - 1] || currentGame;
    const winnerName = (justWon?.score_entry_1 ?? 0) > (justWon?.score_entry_2 ?? 0) ? name1 : name2;
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8">
        <div className="text-6xl mb-4">🏅</div>
        <h1 className="text-3xl font-black mb-2">Game {justWon?.game_number ?? currentGameIdx} Over!</h1>
        <p className="text-gray-400 mb-8">Starting Game {currentGameIdx + 1} of {config.best_of}</p>
        <p className="text-4xl font-black text-emerald-400 mb-8">{winnerName} Wins</p>
        <div className="flex gap-4">
          <button onClick={startNextGame} className="bg-emerald-700 px-8 py-4 rounded-2xl text-xl font-bold hover:bg-emerald-600">
            Next Game →
          </button>
          <button onClick={handleUndo} className="bg-gray-700 px-8 py-4 rounded-2xl text-xl font-bold hover:bg-gray-600">
            ↩️ Undo
          </button>
        </div>
      </div>
    );
  }

  // Match Over
  if (phase === "match_over") {
    // FIX(#51-pad): API field is winner_entry_id; fall back to games tally if not set
    const winner = match.winner_entry_id
      ? (match.winner_entry_id === match.entry_1_id ? name1 : name2)
      : (p1Wins > p2Wins ? name1 : name2);
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8">
        <div className="text-6xl mb-4">🏆</div>
        <h1 className="text-4xl font-black mb-4">Match Complete!</h1>
        <p className="text-5xl font-black text-emerald-400 mb-2">{winner} Wins!</p>
        <p className="text-gray-400 mb-8">{p1Wins} - {p2Wins}</p>
        <Link href="/" className="bg-emerald-700 px-8 py-4 rounded-2xl text-xl font-bold hover:bg-emerald-600">Back to Home</Link>
      </div>
    );
  }

  // Playing
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-emerald-400 font-bold">
            Game {currentGameIdx + 1} / {config.best_of}
          </span>
          <span className="text-gray-500">|</span>
          <span className="text-sm text-gray-400">Best of {config.best_of}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleUndo} disabled={undoStack.length === 0}
            className="text-sm bg-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-600 disabled:opacity-30">↩️ Undo</button>
          <button onClick={() => handleFault("entry_1")} className="text-sm bg-yellow-800 px-3 py-1.5 rounded-lg hover:bg-yellow-700">⚡ Fault</button>
        </div>
      </div>

      {/* Scoreboard */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 py-8 px-4">
        {/* Player 1 */}
        <button onClick={() => scorePoint(1)} className="w-full max-w-md bg-emerald-800/50 rounded-3xl p-6 text-center hover:bg-emerald-700/50 active:scale-95 transition-all">
          <p className="text-gray-400 text-sm mb-2">{serveSide === "left" ? "← Left Court" : "Right Court →"}</p>
          <p className="text-2xl font-medium text-emerald-200">{name1}</p>
          <p className="text-8xl font-black text-white mt-4">{score1}</p>
        </button>

        {/* VS / Controls */}
        <div className="flex items-center gap-6">
          <span className="text-4xl font-bold text-gray-600">VS</span>
          <button onClick={() => handleFault("entry_2")} className="text-sm bg-yellow-800 px-4 py-2 rounded-xl hover:bg-yellow-700">⚡ Fault</button>
          <button onClick={() => handleCard("yellow")} className="text-sm bg-yellow-600 px-4 py-2 rounded-xl hover:bg-yellow-500">🟨 Yellow</button>
          <button onClick={() => handleCard("red")} className="text-sm bg-red-700 px-4 py-2 rounded-xl hover:bg-red-600">🔴 Red</button>
        </div>

        {/* Player 2 */}
        <button onClick={() => scorePoint(2)} className="w-full max-w-md bg-blue-800/50 rounded-3xl p-6 text-center hover:bg-blue-700/50 active:scale-95 transition-all">
          <p className="text-gray-400 text-sm mb-2">{serveSide === "left" ? "Right Court →" : "← Left Court"}</p>
          <p className="text-2xl font-medium text-blue-200">{name2}</p>
          <p className="text-8xl font-black text-white mt-4">{score2}</p>
        </button>

        {/* Card Confirmation */}
        {cardConfirm === "yellow" && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
            <div className="bg-gray-800 rounded-3xl p-8 w-full max-w-sm">
              <h2 className="text-2xl font-bold text-yellow-400 mb-4">🟨 Yellow Card</h2>
              <p className="text-gray-400 mb-6">Issue a yellow card warning?</p>
              <div className="flex gap-3">
                <button onClick={() => { executeCard("yellow"); }} className="flex-1 bg-yellow-600 text-white py-3 rounded-xl font-bold hover:bg-yellow-500">Confirm</button>
                <button onClick={() => setCardConfirm(null)} className="flex-1 bg-gray-700 text-white py-3 rounded-xl font-bold hover:bg-gray-600">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {cardConfirm === "red" && !redCardStep2 && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
            <div className="bg-gray-800 rounded-3xl p-8 w-full max-w-sm">
              <h2 className="text-2xl font-bold text-red-400 mb-4">🔴 Red Card</h2>
              <p className="text-red-300 mb-6">⚠️ This will terminate the match!</p>
              <div className="flex gap-3">
                <button onClick={() => handleCard("red")} className="flex-1 bg-red-700 text-white py-3 rounded-xl font-bold hover:bg-red-600">Continue</button>
                <button onClick={() => setCardConfirm(null)} className="flex-1 bg-gray-700 text-white py-3 rounded-xl font-bold hover:bg-gray-600">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {redCardStep2 && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
            <div className="bg-gray-800 rounded-3xl p-8 w-full max-w-sm border-2 border-red-500">
              <h2 className="text-2xl font-bold text-red-400 mb-2">🔴 FINAL WARNING</h2>
              <p className="text-red-300 text-sm mb-6">Are you absolutely sure? Red card = match terminated immediately.</p>
              <div className="flex gap-3">
                <button onClick={() => executeCard("red")} className="flex-1 bg-red-700 text-white py-3 rounded-xl font-bold hover:bg-red-600">Execute Red Card</button>
                <button onClick={() => { setCardConfirm(null); setRedCardStep2(false); }} className="flex-1 bg-gray-700 text-white py-3 rounded-xl font-bold hover:bg-gray-600">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="bg-gray-800 px-6 py-4 flex items-center justify-between text-sm">
        <span className="text-gray-400">🏸 {serveSide === "left" ? "Left serves" : "Right serves"}</span>
        <span className="text-gray-400">🔄 Switch ends at {Math.ceil(config.points_per_game / 2)} pts</span>
      </div>
    </div>
  );
}
