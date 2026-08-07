"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import type { Match, Game, Category, ScoringConfig } from "@/lib/types";
import { checkGameOver, checkMatchOver } from "@/lib/scoring";

type Side = "left" | "right";
type Phase = "loading" | "coin_toss" | "playing" | "game_over" | "match_over";

async function api(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export default function UmpirePadV2Page({
  params,
}: {
  params: { matchId: string };
}) {
  const { matchId } = params;

  const [match, setMatch] = useState<Match | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [config, setConfig] = useState<ScoringConfig>({ points_per_game: 21, best_of: 3, deuce: true });
  const [phase, setPhase] = useState<Phase>("loading");
  const [currentGameIdx, setCurrentGameIdx] = useState(0);
  const [serveSide, setServeSide] = useState<Side>("left");
  const [lastAction, setLastAction] = useState<1 | 2 | null>(null);
  const [matchSeconds, setMatchSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [shuttleCount, setShuttleCount] = useState(0);
  const [chal1, setChal1] = useState(2);
  const [chal2, setChal2] = useState(2);
  const [undoStack, setUndoStack] = useState<any[]>([]);
  const [cardStep, setCardStep] = useState<{ step: "none" | "yellow_confirm" | "red_confirm" | "red_warning"; target: "entry_1" | "entry_2"; entry_player: 1 | 2 | null }>({ step: "none", target: "entry_1", entry_player: null });
  const [faultTarget, setFaultTarget] = useState<{ entry: "entry_1" | "entry_2"; player: 1 | 2 | null }>({ entry: "entry_1", player: null });
  const [faultCount1, setFaultCount1] = useState(0);
  const [faultCount2, setFaultCount2] = useState(0);
  const [tossStep, setTossStep] = useState<"choose_winner" | "choose_side">("choose_winner");
  const [tossWinner, setTossWinner] = useState<1 | 2 | null>(null);
  const [entry1Name2, setEntry1Name2] = useState(""); // second player name for doubles
  const [entry2Name2, setEntry2Name2] = useState(""); // second player name for doubles
  const [toast, setToast] = useState<{ msg: string; bg: string; text: string } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // ===== OFFLINE MODE =====
  const SNAP_KEY = `tuah_offline_${matchId}`;
  const [offlineMode, setOfflineMode] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const offlineActionsRef = useRef<any[]>([]);
  const gamesRef = useRef<Game[]>([]);
  const matchRef = useRef<Match | null>(null);
  const scoreRef = useRef({ s1: 0, s2: 0 });
  useEffect(() => { gamesRef.current = games; }, [games]);
  useEffect(() => { matchRef.current = match; }, [match]);

  function loadSnapshot() {
    try {
      const raw = localStorage.getItem(SNAP_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function persistSnapshot() {
    try {
      localStorage.setItem(SNAP_KEY, JSON.stringify({
        games: gamesRef.current, match: matchRef.current,
        actions: offlineActionsRef.current, ts: Date.now(),
      }));
    } catch {}
  }
  function clearSnapshot() { try { localStorage.removeItem(SNAP_KEY); } catch {} }
  function isNetErr(e: any) { return e instanceof TypeError || e?.name === "TypeError" || !navigator.onLine; }
  function markOffline(msg = "📡 OFFLINE - will sync later", snapGames?: Game[]) {
    setOfflineMode(true);
    setPendingCount(offlineActionsRef.current.length);
    if (snapGames) gamesRef.current = snapGames;
    persistSnapshot();
    showToast(msg, "bg-orange-600", "text-white");
  }

  async function safePatch(body: any) {
    try {
      await api(`/api/matches/${matchId}`, { method: "PATCH", body: JSON.stringify(body) });
    } catch (e) {
      if (isNetErr(e)) {
        offlineActionsRef.current.push({ type: "toss", payload: body });
        markOffline();
      } else throw e;
    }
  }
  async function safeLog(payload: any) {
    try {
      await api(`/api/point_logs`, { method: "POST", body: JSON.stringify(payload) });
    } catch (e) {
      if (isNetErr(e)) {
        offlineActionsRef.current.push({ type: "log", payload });
        markOffline();
      } else throw e;
    }
  }
  async function safeCard(payload: any) {
    try {
      await api(`/api/card_logs`, { method: "POST", body: JSON.stringify(payload) });
    } catch (e) {
      if (isNetErr(e)) {
        offlineActionsRef.current.push({ type: "card", payload });
        markOffline();
      } else throw e;
    }
  }
  async function safeGameUpdate(gameData: any) {
    try {
      await api(`/api/games/update`, { method: "POST", body: JSON.stringify(gameData) });
    } catch (e) {
      if (isNetErr(e)) {
        offlineActionsRef.current.push({ type: "score", payload: gameData });
        markOffline("📡 OFFLINE - scores saved locally");
      } else throw e;
    }
  }

  // Sync local snapshot to server (replay in order)
  async function syncOfflineState() {
    const snap = loadSnapshot();
    if (!snap || (!snap.games?.length && !snap.actions?.length)) return;
    setSyncing(true);
    try {
      const gamesArr = snap.games || [];
      const idMap: Record<string, string> = {};
      // 1. create games that were created offline (local- prefixed ids)
      for (const g of gamesArr) {
        if (typeof g.id === "string" && g.id.startsWith("local-")) {
          const res = await api(`/api/games/create`, { method: "POST", body: JSON.stringify({ match_id: matchId, game_number: g.game_number }) });
          idMap[g.id] = res.game.id;
          g.id = res.game.id;
        }
      }
      // 2. push every game's final state
      for (const g of gamesArr) {
        await api(`/api/games/update`, { method: "POST", body: JSON.stringify({
          id: g.id, score_entry_1: g.score_entry_1 ?? 0, score_entry_2: g.score_entry_2 ?? 0,
          status: g.status || "playing", winner_id: g.winner_id || null, current_server: g.current_server || 1,
        }) });
      }
      // 3. replay log/card/toss/match actions in order (remap local game ids)
      for (const act of snap.actions || []) {
        if (act.type === "card") {
          await api(`/api/card_logs`, { method: "POST", body: JSON.stringify(act.payload) });
        } else if (act.type === "log") {
          const p = { ...act.payload };
          if (p.game_id && typeof p.game_id === "string" && p.game_id.startsWith("local-")) p.game_id = idMap[p.game_id] || p.game_id;
          await api(`/api/point_logs`, { method: "POST", body: JSON.stringify(p) });
        } else if (act.type === "toss") {
          await api(`/api/matches/${matchId}`, { method: "PATCH", body: JSON.stringify(act.payload) });
        } else if (act.type === "match") {
          await api(`/api/matches/${matchId}`, { method: "PATCH", body: JSON.stringify(act.payload) });
        } else if (act.type === "delete_game") {
          try {
            await api(`/api/games/${act.payload.id}`, { method: "DELETE" });
          } catch (e) {
            console.error("delete_game sync failed", e);
          }
        }
      }
      clearSnapshot();
      offlineActionsRef.current = [];
      setPendingCount(0);
      setOfflineMode(false);
      showToast("🔄 Synced to server!", "bg-emerald-600", "text-white");
      await loadMatch();
    } catch (e) {
      console.error("Sync failed:", e);
      showToast("⚠️ Sync failed - will retry", "bg-red-600", "text-white");
    } finally {
      setSyncing(false);
    }
  }

  // online/offline listeners -> auto sync on reconnect
  useEffect(() => {
    const goOnline = () => { if (navigator.onLine && loadSnapshot()) syncOfflineState(); };
    const goOffline = () => { setOfflineMode(true); };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const currentGame = games[currentGameIdx];
  const score1 = currentGame?.score_entry_1 ?? 0;
  const score2 = currentGame?.score_entry_2 ?? 0;
  // Keep ref in sync for rapid-click safety inside scorePoint (render-time assign)
  scoreRef.current = { s1: score1, s2: score2 };
  const entry1Id = match?.entry_1_id || '';
  const entry2Id = match?.entry_2_id || '';
  const p1Wins = games.filter((g) => g.winner_id === entry1Id).length;
  const p2Wins = games.filter((g) => g.winner_id === entry2Id).length;
  const needed = Math.ceil(config.best_of / 2);
  // Position swap: if winner chose opposite side, swap display
  const [displaySwapped, setDisplaySwapped] = useState(false);
  const [choosingSide, setChoosingSide] = useState(false);

  // Load entries for names
  const [entry1Name, setEntry1Name] = useState("Player 1");
  const [entry2Name, setEntry2Name] = useState("Player 2");
  const [categoryName, setCategoryName] = useState("");

  // Toast helper
  function showToast(msg: string, bg = "bg-yellow-500", text = "text-black") {
    setToast({ msg, bg, text });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Timer
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setMatchSeconds((s) => s + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning]);

  
  // Helper to map player numbers when display is swapped
  function playerNum1Map(p) { return p; } // entry_1's player 1 is always player 1
  function playerNum2Map(p) { return p; } // entry_2's player 1 is always player 1


  const timerDisplay = `${String(Math.floor(matchSeconds / 60)).padStart(2, "0")}:${String(matchSeconds % 60).padStart(2, "0")}`;

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
        setCategoryName(data.category.name || "");
      }

      // Load entry names (supports doubles)
      if (data.entries && data.entries.length > 0) {
        data.entries.forEach((e: any) => {
          if (e.id === matchData.entry_1_id) {
            setEntry1Name(e.player_1_name || "Player 1");
            setEntry1Name2(e.player_2_name || "");
          }
          if (e.id === matchData.entry_2_id) {
            setEntry2Name(e.player_1_name || "Player 2"); // entry_2's primary name
            setEntry2Name2(e.player_2_name || "");
          }
        });
      }

      const gamesData = (data.games || []).filter((g: any) => g.status !== 'completed');
      const allGames = data.games || [];
      // Keep ALL games (including completed ones) for sets/history display AND
      // match-over detection. Only the ACTIVE pad view points at the latest
      // non-completed game. This prevents the "undo erased my game" bug and the
      // regression where completed games vanished from state (breaking SETS).
      setGames(allGames);

      // #38: rebuild correction state after reload so the umpire can still undo
      // the last point + see challenge/shuttle/fault counters. The undo entry is
      // derived from DB game score (point_logs may be incomplete during rapid clicks).
      const logs38 = data.pointLogs || [];
      const lastNonCompleted = [...(allGames || [])].reverse().find((g: any) => g.status !== 'completed');
      if (lastNonCompleted && (Number(lastNonCompleted.score_entry_1) > 0 || Number(lastNonCompleted.score_entry_2) > 0)) {
        const s1 = Number(lastNonCompleted.score_entry_1) || 0;
        const s2 = Number(lastNonCompleted.score_entry_2) || 0;
        const lastScorer = s1 >= s2 ? matchData.entry_1_id : matchData.entry_2_id;
        setUndoStack([{
          gameId: lastNonCompleted.id,
          score1: lastScorer === matchData.entry_1_id ? Math.max(0, s1 - 1) : s1,
          score2: lastScorer === matchData.entry_2_id ? Math.max(0, s2 - 1) : s2,
          gameNumber: lastNonCompleted.game_number,
          gameStatus: 'playing',
          gameWinner: null,
        }]);
      }
      const chalUsed38: Record<string, number> = {};
      let shuttleTotal38 = 0;
      const faultByEntry38: Record<string, number> = {};
      for (const log of logs38) {
        if (log.point_type === 'challenge') chalUsed38[log.scoring_entry_id || ''] = (chalUsed38[log.scoring_entry_id || ''] || 0) + 1;
        else if (log.point_type === 'shuttle') shuttleTotal38 += 1;
        else if (log.point_type === 'fault') faultByEntry38[log.scoring_entry_id || ''] = (faultByEntry38[log.scoring_entry_id || ''] || 0) + 1;
      }
      setShuttleCount(shuttleTotal38);
      if (matchData.entry_1_id) setChal1(Math.max(0, 2 - (chalUsed38[matchData.entry_1_id] || 0)));
      if (matchData.entry_2_id) setChal2(Math.max(0, 2 - (chalUsed38[matchData.entry_2_id] || 0)));
      if (matchData.entry_1_id) setFaultCount1(faultByEntry38[matchData.entry_1_id] || 0);
      if (matchData.entry_2_id) setFaultCount2(faultByEntry38[matchData.entry_2_id] || 0);
      // If match was reset (scheduled but has stale completed games), discard them
      if (data.match?.status === 'scheduled' && data.games?.length > 0 && gamesData.length === 0) {
        // All games are stale completed games - start fresh
        const gameRes = await api(`/api/games/create`, {
          method: "POST",
          body: JSON.stringify({ match_id: matchId, game_number: 1 }),
        });
        setGames([gameRes.game]);
        setPhase("coin_toss");
      } else if (gamesData.length === 0) {
        // All games completed OR none exist - if match is not over, start fresh
        if (data.match?.status === 'completed') {
          setPhase("match_over");
        } else {
          const gameRes = await api(`/api/games/create`, {
            method: "POST",
            body: JSON.stringify({ match_id: matchId, game_number: 1 }),
          });
          setGames([gameRes.game]);
          setPhase("coin_toss");
        }
      } else {
        const lastGame = gamesData[gamesData.length - 1];
        // Remove stale empty trailing games (auto-created after a won game, then undone)
        const trimmed = [...gamesData];
        while (trimmed.length > 1 && trimmed[trimmed.length - 1].score_entry_1 === 0 && trimmed[trimmed.length - 1].score_entry_2 === 0 && trimmed[trimmed.length - 1].status !== 'completed') {
          trimmed.pop();
        }
        // NOTE: `trimmed` only selects which game the pad points at below.
        // `games` state keeps ALL games (incl. completed) for SETS/match-over.
        if (lastGame.status === "completed") {
          setPhase("match_over");
        } else {
          // Index into the FULL allGames array (games state keeps ALL games incl.
          // completed for SETS counting). trimmed is a subset (non-completed only),
          // so trimmed.length-1 would point at the wrong game when a completed
          // game precedes it — corrupting completed scores on the next click.
          const activeGame = trimmed[trimmed.length - 1];
          const activeIdx = allGames.findIndex((g: any) => g.id === activeGame.id);
          setCurrentGameIdx(activeIdx >= 0 ? activeIdx : Math.max(0, allGames.length - 1));
          // Check if toss was already completed to determine the right step
          if (matchData.toss_winner_entry_id) {
            const tw = matchData.entry_1_id === matchData.toss_winner_entry_id ? 1 : 2;
            setTossWinner(tw);
            if (matchData.toss_chose_side && (matchData.toss_chose_side === "left" || matchData.toss_chose_side === "right")) {
              setDisplaySwapped(tw === 2 ? matchData.toss_chose_side === "left" : matchData.toss_chose_side === "right");
              setServeSide(matchData.toss_chose_side);
              setPhase("choose_serve");
            } else if (matchData.toss_chose_side === "serve" || matchData.toss_chose_side === "receive") {
              setDisplaySwapped(tw === 2 ? true : false);
              setServeSide(matchData.toss_chose_side);
              setPhase("playing");
            } else {
              setTossStep("choose_side");
              setPhase("coin_toss");
            }
          } else {
            setPhase("coin_toss");
          }
        }
      }

      // Set match to playing ONLY when not completed. PATCHing a completed match
      // triggers the server-side Umpire-Challenge reopen which CLEARS the winner
      // slot auto-advanced into the next round — corrupting the bracket on reload.
      if (data.match?.status !== 'completed') {
        await api(`/api/matches/${matchId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "playing" }),
        });
      }
    } catch (err) {
      console.error("Load match error:", err);
      // Offline fallback: restore from local snapshot so pad still works
      if (isNetErr(err)) {
        const snap = loadSnapshot();
        if (snap?.games?.length) {
          setGames(snap.games);
          if (snap.match) setMatch(snap.match);
          setOfflineMode(true);
          setPhase("playing");
          setCurrentGameIdx(snap.games.length - 1);
          showToast("📡 OFFLINE - restored local data", "bg-orange-600", "text-white");
        }
      }
    }
  }

  async function scorePoint(player: 1 | 2) {
    if (!currentGame || phase === "game_over" || phase === "match_over") return;

    // Read LATEST score from ref (fixes rapid-click losing points due to stale closure)
    const curS1 = scoreRef.current.s1;
    const curS2 = scoreRef.current.s2;
    const newScore1 = player === 1 ? curS1 + 1 : curS1;
    const newScore2 = player === 2 ? curS2 + 1 : curS2;
    scoreRef.current = { s1: newScore1, s2: newScore2 };

    // Save undo state
    setUndoStack([...undoStack, {
      gameId: currentGame.id,
      score1: curS1, score2: curS2,
      gameNumber: currentGame.game_number,
      gameStatus: currentGame.status,
      gameWinner: currentGame.winner_id,
    }]);

    const result = checkGameOver(newScore1, newScore2, config);

    if (result.isGameOver) {
      const entry1Id = match?.entry_1_id || '';
      const entry2Id = match?.entry_2_id || '';
      const winnerEntryId = result.winner === "player1" ? entry1Id : entry2Id;
      const prevGames = games
        .filter((g) => g.id !== currentGame.id)
        .map((g) => ({
          game_number: g.game_number,
          winner: g.winner_id === entry1Id ? "player1" as const : g.winner_id === entry2Id ? "player2" as const : null,
        }));
      const isMatchDone = checkMatchOver(
        [...prevGames, {
          game_number: currentGame.game_number,
          winner: result.winner,
        }],
        config
      );

      // Optimistic UI update FIRST (no interruption even offline)
      setGames(games.map((g) =>
        g.id === currentGame.id
          ? { ...g, score_entry_1: newScore1, score_entry_2: newScore2, status: "completed", winner_id: winnerEntryId }
          : g
      ));
      await safeGameUpdate({ id: currentGame.id, score_entry_1: newScore1, score_entry_2: newScore2, status: "completed", winner_id: winnerEntryId });

      if (isMatchDone.isMatchOver) {
        const matchWinnerId = isMatchDone.winner === "player1" ? match!.entry_1_id : match!.entry_2_id;
        setMatch(m => m ? { ...m, status: "completed", winner_id: matchWinnerId } : m);
        setPhase("match_over");
        try {
          await api(`/api/matches/${matchId}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "completed", winner_id: matchWinnerId }),
          });
        } catch (e) {
          if (isNetErr(e)) {
            offlineActionsRef.current.push({ type: "match", payload: { status: "completed", winner_id: matchWinnerId } });
            markOffline();
          } else throw e;
        }
        showToast(`🏆 MATCH COMPLETED! WINNER: ${result.winner === "player1" ? entry1Name : entry2Name}`, "bg-green-600", "text-white");
      } else {
        setLastAction(player);
        showToast(`${result.winner === "player1" ? entry1Name : entry2Name} Wins Game!`, result.winner === "player1" ? "bg-blue-600" : "bg-red-600", "text-white");
        setTimeout(() => {
          // Create next game (offline: use local temp id, synced later)
          const nextNum = currentGame.game_number + 1;
          api(`/api/games/create`, {
            method: "POST",
            body: JSON.stringify({ match_id: matchId, game_number: nextNum }),
          }).then((res) => {
            setGames(prev => [...prev, res.game]);
            setCurrentGameIdx(prev => prev + 1);
            setServeSide(s => s === "left" ? "right" : "left");
            setLastAction(null);
            setPhase("playing");
            // Reset score ref IMMEDIATELY so rapid clicks on the new game
            // don't inherit the previous game's score as their base.
            scoreRef.current = { s1: 0, s2: 0 };
          }).catch((e) => {
            if (isNetErr(e)) {
              setOfflineMode(true);
              const tmp = { id: `local-${nextNum}`, match_id: matchId, game_number: nextNum, score_entry_1: 0, score_entry_2: 0, status: "playing", current_server: player, winner_id: null };
              const nextGames = [...gamesRef.current, tmp];
              setGames(nextGames);
              setCurrentGameIdx(prev => prev + 1);
              setServeSide(s => s === "left" ? "right" : "left");
              setLastAction(null);
              setPhase("playing");
              scoreRef.current = { s1: 0, s2: 0 };
              markOffline("📡 OFFLINE - next game ready locally", nextGames);
            } else throw e;
          });
        }, 5000);
        setPhase("game_over");
      }
    } else {
      // Optimistic UI update FIRST
      setGames(games.map((g) =>
        g.id === currentGame.id
          ? { ...g, score_entry_1: newScore1, score_entry_2: newScore2, current_server: player }
          : g
      ));
      setLastAction(player);
      await safeGameUpdate({ id: currentGame.id, score_entry_1: newScore1, score_entry_2: newScore2, current_server: player });
    }
  }

  async function handleUndo() {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack(undoStack.slice(0, -1));

    // Umpire Challenge: was the match completed by this point?
    const wasMatchCompleted = match?.status === "completed" || phase === "match_over";

    // Optimistic UI update FIRST
    setGames(games.map((g) =>
      g.id === last.gameId
        ? { ...g, score_entry_1: last.score1, score_entry_2: last.score2, status: "playing", winner_id: null }
        : g
    ));

    if (currentGame && last.gameNumber !== currentGame.game_number) {
      setCurrentGameIdx(last.gameNumber - 1);
    }
    setLastAction(null);
    setPhase("playing");
    // Reset score ref immediately so the next click uses the undone score
    // as its base (prevents score inflation after undo).
    scoreRef.current = { s1: last.score1, s2: last.score2 };
    await safeGameUpdate({ id: last.gameId, score_entry_1: last.score1, score_entry_2: last.score2, status: "playing", winner_id: null });

    // Remove any stale empty trailing games (auto-created after the won game).
    // Without this, reload shows the leftover empty game instead of the undone one.
    const staleGames = games.filter((g) =>
      g.game_number > (last.gameNumber ?? 0) &&
      (g.score_entry_1 ?? 0) === 0 && (g.score_entry_2 ?? 0) === 0 &&
      g.status !== "completed"
    );
    if (staleGames.length > 0) {
      setGames(prev => prev.filter((g) => !staleGames.some(sg => sg.id === g.id)));
      for (const sg of staleGames) {
        try {
          await api(`/api/games/${sg.id}`, { method: "DELETE" });
        } catch (e) {
          if (isNetErr(e)) {
            offlineActionsRef.current.push({ type: "delete_game", payload: { id: sg.id } });
            markOffline();
          }
        }
      }
    }

    // Umpire Challenge: undo the match-winning point -> reopen the match server-side
    if (wasMatchCompleted) {
      setMatch(m => m ? { ...m, status: "in_progress", winner_entry_id: null } : m);
      try {
        await api(`/api/matches/${matchId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "in_progress", winner_id: null }),
        });
      } catch (e) {
        if (isNetErr(e)) {
          offlineActionsRef.current.push({ type: "match", payload: { status: "in_progress", winner_id: null } });
          markOffline();
        } else throw e;
      }
    }
    showToast("↩ Point Undone", "bg-teal-600", "text-white");
  }

  async function handleFault(entry: "entry_1" | "entry_2", playerNumber: 1 | 2 | null = null) {
    const isP1 = entry === "entry_1";
    const newCount = isP1 ? faultCount1 + 1 : faultCount2 + 1;
    const playerSuffix = playerNumber ? (playerNumber === 1 ? " P1" : " P2") : "";
    const playerName = isP1
      ? (playerNumber === 1 ? entry1Name : playerNumber === 2 && entry1Name2 ? entry1Name2 : entry1Name)
      : (playerNumber === 1 ? entry2Name : playerNumber === 2 && entry2Name2 ? entry2Name2 : entry2Name);
    const entryId = entry === "entry_1" ? match!.entry_1_id : match!.entry_2_id;

    if (isP1) setFaultCount1(newCount);
    else setFaultCount2(newCount);

    await safeLog({
      game_id: currentGame!.id,
      match_id: matchId,
      scoring_entry_id: entryId,
      action: "fault",
      point_type: "fault",
      player_number: playerNumber,
    });

    await safeCard({
      match_id: matchId,
      entry_id: entryId,
      card_type: "yellow",
      reason: `Fault #${newCount} - ${playerName}`,
      player_number: playerNumber,
    });

    const faultsToLose = 2;
    if (newCount >= faultsToLose) {
      const opponent = isP1 ? 2 : 1;
      await scorePoint(opponent);
      if (isP1) setFaultCount1(0);
      else setFaultCount2(0);
      showToast(`⚡ ${faultsToLose} faults - point to ${opponent === 1 ? entry1Name : entry2Name}!`, "bg-yellow-600", "text-white");
    } else {
      showToast(`⚡ Fault #${newCount} - ${playerName}`, "bg-yellow-600", "text-white");
    }
  }

  async function executeCard(type: string) {
    const target = cardStep.target;
    const playerId = target === "entry_1" ? match?.entry_1_id : match?.entry_2_id;
    await safeCard({
      match_id: matchId,
      entry_id: playerId || "unknown",
      card_type: type,
      reason: `${type.toUpperCase()} card - ${target === "entry_1" ? entry1Name : entry2Name}`,
    });
    if (type === "red") {
      // BWF rule: red card = player disqualified -> OPPONENT wins the match
      const opponentId = target === "entry_1" ? match?.entry_2_id : match?.entry_1_id;
      try {
        await api(`/api/matches/${matchId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "completed", winner_id: opponentId || null }),
        });
      } catch (e) {
        if (isNetErr(e)) {
          offlineActionsRef.current.push({ type: "match", payload: { status: "completed", winner_id: opponentId || null } });
          markOffline();
        } else throw e;
      }
      setMatch(m => m ? { ...m, status: "completed", winner_entry_id: opponentId || null } : m);
      setPhase("match_over");
      showToast(`🔴 RED CARD - ${target === "entry_1" ? entry1Name : entry2Name} DISQUALIFIED`, "bg-red-700", "text-white");
    } else {
      showToast(`🟨 Yellow Card - ${target === "entry_1" ? entry1Name : entry2Name}`, "bg-yellow-500", "text-black");
    }
    setCardStep(prev => ({ ...prev, step: "none" }));
  }

  function toggleTimer() {
    setIsTimerRunning(!isTimerRunning);
  }

  async function handleAddShuttle() {
    setShuttleCount(s => s + 1);
    await safeLog({
      game_id: currentGame!.id,
      match_id: matchId,
      scoring_entry_id: "",
      action: "shuttle",
      point_type: "shuttle",
    });
    showToast("Shuttle Added", "bg-gray-200", "text-black");
  }

  async function handleUseChallenge(player: 1 | 2) {
    if (player === 1 && chal1 > 0) {
      setChal1(c => c - 1);
      await safeLog({
        game_id: currentGame!.id,
        match_id: matchId,
        scoring_entry_id: match?.entry_1_id,
        action: "challenge",
        point_type: "challenge",
        player_number: player,
      });
      showToast(`${entry1Name}: Challenge Used`, "bg-blue-500", "text-white");
    }
    if (player === 2 && chal2 > 0) {
      setChal2(c => c - 1);
      await safeLog({
        game_id: currentGame!.id,
        match_id: matchId,
        scoring_entry_id: match?.entry_2_id,
        action: "challenge",
        point_type: "challenge",
        player_number: player,
      });
      showToast(`${entry2Name}: Challenge Used`, "bg-red-500", "text-white");
    }
  }

  // Service arrow calculations
  // In badminton: server serves from right court when own score is even, left when odd
  // The arrow POINTS in the direction the shuttle travels (server -> receiver)
  // lastAction indicates who won the last point (and thus serves next)
    function getServiceArrow() {
    // The arrow shows the SHUTTLE FLIGHT DIRECTION (server -> receiver).
    // Whoever won the last point serves next, and the shuttle travels
    // from the server's half toward the receiver's half:
    //   - Server on LEFT half  -> shuttle travels RIGHT -> ↘️
    //   - Server on RIGHT half -> shuttle travels LEFT  -> ↙️
    // The arrow keeps pointing at the receiver for as long as the same
    // player keeps serving (no blind left/right alternation per point).
    // Determine who serves: last point winner, else current server, else player 1.
    const server = lastAction === 1 ? 1 : lastAction === 2 ? 2
      : (currentGame?.current_server === 1 ? 1 : currentGame?.current_server === 2 ? 2 : 1);
    const serverOnLeft = (server === 1) !== displaySwapped; // entry1 is left unless sides swapped
    return serverOnLeft ? '↘️' : '↙️';
  }

  if (phase === "loading") {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // Coin Toss Phase (two-step: pick winner, then choose side)
  if (phase === "coin_toss") {
    if (tossStep === "choose_winner") {
      return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8">
          <div className="text-6xl mb-4">COIN</div>
          <h1 className="text-4xl font-black mb-2">Coin Toss</h1>
          <p className="text-gray-400 mb-8 text-lg">Who won the toss?</p>
          <div className="flex gap-6">
            <button
              onClick={async () => {
                setTossWinner(1);
                setTossStep("choose_side");
                await safePatch({ toss_winner_entry_id: match?.entry_1_id });
              }}
              className="bg-blue-700 hover:bg-blue-600 text-white px-12 py-8 rounded-2xl text-2xl font-bold transition-all active:scale-95 shadow-xl"
            >
              {entry1Name}{entry1Name2 ? " & team" : ""}
            </button>
            <button
              onClick={async () => {
                setTossWinner(2);
                setTossStep("choose_side");
                await safePatch({ toss_winner_entry_id: match?.entry_2_id });
              }}
              className="bg-red-700 hover:bg-red-600 text-white px-12 py-8 rounded-2xl text-2xl font-bold transition-all active:scale-95 shadow-xl"
            >
              {entry2Name}{entry2Name2 ? " & team" : ""}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8">
        <div className="text-6xl mb-4">TROPHY</div>
        <h1 className="text-4xl font-black mb-2">{tossWinner === 1 ? entry1Name : entry2Name}{tossWinner === 1 && entry1Name2 ? " & team" : tossWinner === 2 && entry2Name2 ? " & team" : ""}</h1>
        <p className="text-emerald-400 text-2xl font-black mb-6">Won the Toss!</p>
        <p className="text-gray-400 mb-6 text-lg">Choose your preference</p>
        <div className="flex gap-3 flex-wrap justify-center">
          <button
            onClick={async () => {
              setServeSide("left");
              setDisplaySwapped(tossWinner === 2);
              setPhase("choose_serve");
              await safePatch({ toss_chose_side: "left" });
            }}
            className="bg-emerald-700 hover:bg-emerald-600 text-white px-6 py-4 rounded-2xl text-lg font-bold transition-all active:scale-95 shadow-xl"
          >
            LEFT Side
          </button>
          <button
            onClick={async () => {
              setServeSide("right");
              setDisplaySwapped(tossWinner === 1);
              setPhase("choose_serve");
              await safePatch({ toss_chose_side: "right" });
            }}
            className="bg-blue-700 hover:bg-blue-600 text-white px-6 py-4 rounded-2xl text-lg font-bold transition-all active:scale-95 shadow-xl"
          >
            RIGHT Side
          </button>
        </div>
      </div>
    );
  }
  if (phase === "choose_serve") {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8">
        <div className="text-6xl mb-4">&#127934;</div>
        <h1 className="text-4xl font-black mb-2">{tossWinner === 1 ? entry1Name : entry2Name}{tossWinner === 1 && entry1Name2 ? " & team" : tossWinner === 2 && entry2Name2 ? " & team" : ""}</h1>
        <p className="text-emerald-400 text-2xl font-black mb-2">Choose Side!</p>
        <p className="text-gray-400 mb-6 text-lg">Who serves first?</p>
        <div className="flex gap-3 flex-wrap justify-center">
          <button
            onClick={async () => {
              setServeSide("left");
              setLastAction(tossWinner === 1 ? 1 : 2);
              setPhase("playing");
              if (!isTimerRunning) toggleTimer();
              await safePatch({ toss_chose_side: "serve" });
            }}
            className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-4 rounded-2xl text-lg font-bold transition-all active:scale-95 shadow-xl"
          >
            SERVE
          </button>
          <button
            onClick={async () => {
              setServeSide("right");
              setLastAction(tossWinner === 1 ? 2 : 1);
              setPhase("playing");
              if (!isTimerRunning) toggleTimer();
              await safePatch({ toss_chose_side: "receive" });
            }}
            className="bg-gray-600 hover:bg-gray-500 text-white px-6 py-4 rounded-2xl text-lg font-bold transition-all active:scale-95 shadow-xl"
          >
            RECEIVE
          </button>
        </div>
      </div>
    );
  }

  // Match Over
  // Match Over
  // Match Over
  if (phase === "match_over") {
    const winnerId = match?.winner_entry_id || match?.winner_id;
    const winnerName = winnerId === match?.entry_1_id ? entry1Name : entry2Name;
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8">
        <div className="text-7xl mb-6">🏆</div>
        <h1 className="text-5xl font-black mb-4">Match Complete!</h1>
        <p className="text-4xl font-black text-emerald-400 mb-4">{winnerName} Wins!</p>
        <p className="text-2xl text-gray-400 mb-8">{p1Wins} - {p2Wins}</p>
        {undoStack.length > 0 && (
          <button
            onClick={handleUndo}
            className="bg-amber-600 hover:bg-amber-500 text-white px-8 py-4 rounded-2xl text-xl font-bold mb-4 transition-all active:scale-95"
          >
            ↩ Undo Last Point (Umpire Challenge)
          </button>
        )}

        <a href="/" className="bg-emerald-700 hover:bg-emerald-600 text-white px-8 py-4 rounded-2xl text-xl font-bold">
          Back to Home
        </a>
      </div>
    );
  }

  // Game Over (between games)
  if (phase === "game_over") {
    const gameWinner = score1 > score2 ? entry1Name : entry2Name;
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8">
        <div className="text-6xl mb-4">🏸</div>
        <h1 className="text-4xl font-black mb-2">Game {currentGameIdx + 1}</h1>
        <p className="text-2xl font-black text-emerald-400 mb-4">{gameWinner} Wins Game!</p>
        <p className="text-gray-400 mb-2">
          {score1} - {score2}
        </p>
        <p className="text-gray-500 mb-8">
          Sets: {p1Wins} - {p2Wins} (Best of {config.best_of})
        </p>
        <div className="animate-pulse text-gray-400">Starting next game...</div>
      </div>
    );
  }

  // ===================== PLAYING PHASE =====================
  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-gray-900 text-white font-sans select-none touch-manipulation">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-18 left-1/2 -translate-x-1/2 ${toast.bg} ${toast.text} px-6 py-3 rounded-full font-bold shadow-2xl z-50 text-xl transition-all duration-300`}>
          {toast.msg}
        </div>
      )}

      {/* Header / Status Bar */}
      <div className="h-14 md:h-16 bg-gray-800 flex justify-between items-center px-4 md:px-6 border-b border-gray-700 shadow-lg z-20 shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold text-lg tracking-wider text-gray-300">
            TUAH <span className="text-blue-400">V2</span>
          </span>
          <span className="hidden md:inline bg-indigo-600 text-white px-2 py-0.5 rounded text-xs font-bold">
            {categoryName || "MATCH"}
          </span>
        </div>
        <div className="flex items-center gap-2 md:gap-4 text-sm md:text-base">
          {offlineMode && (
            <span className={`px-3 py-1 rounded-full text-xs font-black ${syncing ? "bg-blue-600 text-white" : "bg-orange-600 text-white animate-pulse"}`}>
              {syncing ? "🔄 SYNCING..." : `📡 OFFLINE${pendingCount > 0 ? ` ${pendingCount}` : ""}`}
            </span>
          )}
          <span className="text-yellow-400 font-mono font-bold">{timerDisplay}</span>
          <button
            onClick={toggleTimer}
            className={`text-xs px-2 md:px-3 py-1 rounded font-bold border transition-all ${
              isTimerRunning ? "bg-red-700 border-red-500 hover:bg-red-600" : "bg-gray-600 border-gray-500 hover:bg-gray-500"
            }`}
          >
            {isTimerRunning ? "⏸ PAUSE" : "▶ START"}
          </button>
          <span className="hidden md:inline text-gray-400 text-xs">
            Game {currentGame?.game_number ?? currentGameIdx + 1}/{config.best_of} | {config.points_per_game}pts
          </span>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex relative">
        {/* ============ LEFT HALF (Player 1) ============ */}
        <div
          onClick={() => scorePoint(displaySwapped ? 2 : 1)}
          className="flex-1 bg-gradient-to-b from-blue-900/40 to-blue-950/80 hover:from-blue-800/50 hover:to-blue-900/80 active:from-blue-700/60 cursor-pointer flex flex-col items-center justify-center p-4 md:p-8 transition-all relative border-r border-gray-800"
        >
          {/* Player Info */}
          <div className="flex items-center gap-2 mb-2">
            <span className="w-3 h-3 rounded-full bg-blue-400 animate-pulse"></span>
            <span className="text-blue-200 font-bold text-lg md:text-2xl">{displaySwapped ? entry2Name : entry1Name}</span>
          </div>
          {/* Sets */}
          <div className="text-gray-400 text-xs md:text-sm mb-1">
            SETS: <span className="text-white font-bold">{displaySwapped ? p2Wins : p1Wins}</span>
          </div>
          {/* Score */}
          <div className="text-7xl md:text-9xl font-black text-white drop-shadow-[0_0_30px_rgba(59,130,246,0.3)]">
            {displaySwapped ? score2 : score1}
          </div>
        </div>

        {/* ============ CENTER CONSOLE (Overlay) ============ */}
        <div className="absolute top-2 md:top-4 left-1/2 -translate-x-1/2 w-[95%] md:w-3/4 max-w-2xl bg-gray-800/95 rounded-2xl shadow-2xl border border-gray-700 p-3 md:p-4 z-10 flex flex-col gap-2 md:gap-3 backdrop-blur-sm">
          {/* Cards + Sets Row */}
          <div className="flex justify-between items-center">
            <div className="flex gap-1 md:gap-2 items-center">
              {entry1Name2 ? (
                <>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[7px] text-gray-400 font-bold">{entry1Name.split(" ").pop()}</span>
                    <div className="flex gap-0.5">
                      <button onClick={(e) => { e.stopPropagation(); setCardStep({ step: "yellow_confirm", target: displaySwapped ? "entry_2" : "entry_1", entry_player: 1 }); }}
                        className="w-7 h-7 md:w-9 md:h-9 bg-yellow-500 rounded-full flex items-center justify-center font-bold text-black text-[8px] md:text-xs hover:bg-yellow-400" title={`Yellow card for ${entry1Name}`}>W</button>
                      <button onClick={(e) => { e.stopPropagation(); setCardStep({ step: "red_confirm", target: displaySwapped ? "entry_2" : "entry_1", entry_player: 1 }); }}
                        className="w-7 h-7 md:w-9 md:h-9 bg-red-600 rounded-full flex items-center justify-center font-bold text-white text-[8px] md:text-xs hover:bg-red-500" title={`Red card for ${entry1Name}`}>F</button>
                      <button onClick={(e) => { e.stopPropagation(); handleFault(displaySwapped ? "entry_2" : "entry_1", 1); }}
                        className="w-7 h-7 md:w-9 md:h-9 bg-orange-500 rounded-full flex items-center justify-center font-bold text-white text-[8px] md:text-xs hover:bg-orange-400" title={`Fault - ${entry1Name}`}>⚡</button>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[7px] text-gray-400 font-bold">{entry1Name2.split(" ").pop()}</span>
                    <div className="flex gap-0.5">
                      <button onClick={(e) => { e.stopPropagation(); setCardStep({ step: "yellow_confirm", target: displaySwapped ? "entry_2" : "entry_1", entry_player: 2 }); }}
                        className="w-7 h-7 md:w-9 md:h-9 bg-yellow-500 rounded-full flex items-center justify-center font-bold text-black text-[8px] md:text-xs hover:bg-yellow-400" title={`Yellow card for ${entry1Name2}`}>W</button>
                      <button onClick={(e) => { e.stopPropagation(); setCardStep({ step: "red_confirm", target: displaySwapped ? "entry_2" : "entry_1", entry_player: 2 }); }}
                        className="w-7 h-7 md:w-9 md:h-9 bg-red-600 rounded-full flex items-center justify-center font-bold text-white text-[8px] md:text-xs hover:bg-red-500" title={`Red card for ${entry1Name2}`}>F</button>
                      <button onClick={(e) => { e.stopPropagation(); handleFault(displaySwapped ? "entry_2" : "entry_1", 2); }}
                        className="w-7 h-7 md:w-9 md:h-9 bg-orange-500 rounded-full flex items-center justify-center font-bold text-white text-[8px] md:text-xs hover:bg-orange-400" title={`Fault - ${entry1Name2}`}>⚡</button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <button onClick={(e) => { e.stopPropagation(); setCardStep({ step: "yellow_confirm", target: displaySwapped ? "entry_2" : "entry_1", entry_player: 1 }); }}
                    className="w-9 h-9 md:w-11 md:h-11 bg-yellow-500 rounded-full flex items-center justify-center font-bold text-black text-[10px] md:text-sm hover:bg-yellow-400 active:scale-95 shadow-lg border-2 border-yellow-600 transition-all" title="Yellow card (P1)">W</button>
                  <button onClick={(e) => { e.stopPropagation(); setCardStep({ step: "red_confirm", target: displaySwapped ? "entry_2" : "entry_1", entry_player: 1 }); }}
                    className="w-9 h-9 md:w-11 md:h-11 bg-red-600 rounded-full flex items-center justify-center font-bold text-white text-[10px] md:text-sm hover:bg-red-500 active:scale-95 shadow-lg border-2 border-red-800 transition-all" title="Red card (P1)">F</button>
                  <button onClick={(e) => { e.stopPropagation(); handleFault(displaySwapped ? "entry_2" : "entry_1", 1); }}
                    className="w-10 h-10 md:w-12 md:h-12 bg-orange-500 rounded-full flex items-center justify-center font-bold text-white text-sm md:text-lg hover:bg-orange-400 active:scale-95 shadow-lg border-2 border-orange-600 transition-all" title="Fault (P1)">⚡</button>
                </>
              )}
              <div className="flex flex-col items-center ml-1 md:ml-2">
                <span className="text-[8px] md:text-[10px] text-blue-400 font-bold uppercase">SETS</span>
                <span className="text-white font-black text-sm md:text-lg">{displaySwapped ? p2Wins : p1Wins}</span>
              </div>
            </div>

            {/* Score Center */}
            <div className="relative bg-gray-200 text-black text-3xl md:text-6xl font-black px-4 md:px-8 py-1 md:py-2 rounded-xl flex items-center justify-center min-w-[120px] md:min-w-[200px] tracking-widest shadow-inner">
              <button
                onClick={(e) => { e.stopPropagation(); handleUndo(); }}
                className="absolute -left-4 md:-left-6 -top-3 md:-top-4 w-10 h-10 md:w-12 md:h-12 bg-teal-600 rounded-full flex items-center justify-center text-xl md:text-2xl text-white hover:bg-teal-500 active:scale-95 shadow-xl border-2 border-white transition-all"
                disabled={undoStack.length === 0}
              >
                ↩
              </button>
              <span className="text-blue-700">{displaySwapped ? score2 : score1}</span>
              <span className="mx-2 md:mx-4 text-gray-400 font-normal">-</span>
              <span className="text-red-700">{displaySwapped ? score1 : score2}</span>
            </div>

            <div className="flex gap-1 md:gap-2 items-center">
              <div className="flex flex-col items-center mr-1 md:mr-2">
                <span className="text-[8px] md:text-[10px] text-red-400 font-bold uppercase">SETS</span>
                <span className="text-white font-black text-sm md:text-lg">{displaySwapped ? p1Wins : p2Wins}</span>
              </div>
              {entry2Name2 ? (
                <>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[7px] text-gray-400 font-bold">{entry2Name.split(" ").pop()}</span>
                    <div className="flex gap-0.5">
                      <button onClick={(e) => { e.stopPropagation(); handleFault(displaySwapped ? "entry_1" : "entry_2", 1); }}
                        className="w-7 h-7 md:w-9 md:h-9 bg-orange-500 rounded-full flex items-center justify-center font-bold text-white text-[8px] md:text-xs hover:bg-orange-400" title={`Fault - ${entry2Name}`}>⚡</button>
                      <button onClick={(e) => { e.stopPropagation(); setCardStep({ step: "yellow_confirm", target: displaySwapped ? "entry_1" : "entry_2", entry_player: 1 }); }}
                        className="w-7 h-7 md:w-9 md:h-9 bg-yellow-500 rounded-full flex items-center justify-center font-bold text-black text-[8px] md:text-xs hover:bg-yellow-400" title={`Yellow card for ${entry2Name}`}>W</button>
                      <button onClick={(e) => { e.stopPropagation(); setCardStep({ step: "red_confirm", target: displaySwapped ? "entry_1" : "entry_2", entry_player: 1 }); }}
                        className="w-7 h-7 md:w-9 md:h-9 bg-red-600 rounded-full flex items-center justify-center font-bold text-white text-[8px] md:text-xs hover:bg-red-500" title={`Red card for ${entry2Name}`}>F</button>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[7px] text-gray-400 font-bold">{entry2Name2.split(" ").pop()}</span>
                    <div className="flex gap-0.5">
                      <button onClick={(e) => { e.stopPropagation(); handleFault(displaySwapped ? "entry_1" : "entry_2", 2); }}
                        className="w-7 h-7 md:w-9 md:h-9 bg-orange-500 rounded-full flex items-center justify-center font-bold text-white text-[8px] md:text-xs hover:bg-orange-400" title={`Fault - ${entry2Name2}`}>⚡</button>
                      <button onClick={(e) => { e.stopPropagation(); setCardStep({ step: "yellow_confirm", target: displaySwapped ? "entry_1" : "entry_2", entry_player: 2 }); }}
                        className="w-7 h-7 md:w-9 md:h-9 bg-yellow-500 rounded-full flex items-center justify-center font-bold text-black text-[8px] md:text-xs hover:bg-yellow-400" title={`Yellow card for ${entry2Name2}`}>W</button>
                      <button onClick={(e) => { e.stopPropagation(); setCardStep({ step: "red_confirm", target: displaySwapped ? "entry_1" : "entry_2", entry_player: 2 }); }}
                        className="w-7 h-7 md:w-9 md:h-9 bg-red-600 rounded-full flex items-center justify-center font-bold text-white text-[8px] md:text-xs hover:bg-red-500" title={`Red card for ${entry2Name2}`}>F</button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <button onClick={(e) => { e.stopPropagation(); handleFault(displaySwapped ? "entry_1" : "entry_2", 1); }}
                    className="w-10 h-10 md:w-12 md:h-12 bg-orange-500 rounded-full flex items-center justify-center font-bold text-white text-sm md:text-lg hover:bg-orange-400 active:scale-95 shadow-lg border-2 border-orange-600 transition-all" title="Fault for P2">⚡</button>
                  <button onClick={(e) => { e.stopPropagation(); setCardStep({ step: "yellow_confirm", target: displaySwapped ? "entry_1" : "entry_2", entry_player: 1 }); }}
                    className="w-9 h-9 md:w-11 md:h-11 bg-yellow-500 rounded-full flex items-center justify-center font-bold text-black text-[10px] md:text-sm hover:bg-yellow-400 active:scale-95 shadow-lg border-2 border-yellow-600 transition-all" title="Yellow card (P2)">W</button>
                  <button onClick={(e) => { e.stopPropagation(); setCardStep({ step: "red_confirm", target: displaySwapped ? "entry_1" : "entry_2", entry_player: 1 }); }}
                    className="w-9 h-9 md:w-11 md:h-11 bg-red-600 rounded-full flex items-center justify-center font-bold text-white text-[10px] md:text-sm hover:bg-red-500 active:scale-95 shadow-lg border-2 border-red-800 transition-all" title="Red card (P2)">F</button>
                </>
              )}
            </div>
          </div>

          {/* Court Quadrants */}
          <div className="w-full h-20 md:h-32 grid grid-cols-2 grid-rows-2 gap-[1px] border-2 border-white relative rounded overflow-hidden">
            <div className="bg-emerald-600 flex items-center justify-center text-center border-b border-r border-white/30">
              <span className="text-[10px] md:text-xs font-bold uppercase opacity-90">{(displaySwapped ? entry2Name : entry1Name).split(" ")[0] || "A1"}</span>
            </div>
            <div className="bg-emerald-600 flex items-center justify-center text-center border-b border-white/30">
              <span className="text-[10px] md:text-xs font-bold uppercase opacity-90">{(displaySwapped ? entry1Name : entry2Name).split(" ")[0] || "B1"}</span>
            </div>
            <div className="bg-emerald-600 flex items-center justify-center text-center border-r border-white/30">
              <span className="text-[10px] md:text-xs font-bold uppercase opacity-90">{(displaySwapped ? entry2Name : entry1Name).split(" ").slice(-1)[0] || "A2"}</span>
            </div>
            <div className="bg-emerald-600 flex items-center justify-center text-center">
              <span className="text-[10px] md:text-xs font-bold uppercase opacity-90">{(displaySwapped ? entry1Name : entry2Name).split(" ").slice(-1)[0] || "B2"}</span>
            </div>
            {/* Service Arrow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl md:text-5xl font-bold drop-shadow-md pointer-events-none">
              {getServiceArrow()}
            </div>
          </div>

          {/* Bottom Controls */}
          <div className="flex justify-between items-center text-gray-400 text-xs md:text-sm font-bold px-1 md:px-2">
            <div className="flex flex-col items-center">
              <span className="mb-0.5 md:mb-1 text-[10px] md:text-xs">🏸 <span id="shuttle-count" className="text-white">{shuttleCount}</span></span>
              <button
                onClick={(e) => { e.stopPropagation(); handleAddShuttle(); }}
                className="w-8 h-8 md:w-10 md:h-10 bg-gray-700 rounded-full flex items-center justify-center text-sm md:text-xl text-white active:scale-95 border border-gray-600 transition-all"
              >
                +1
              </button>
            </div>
            <div className="flex gap-4 md:gap-6">
              <div className="flex flex-col items-center">
                <span className="mb-0.5 md:mb-1 text-[10px] md:text-xs text-blue-400">🔵 CHAL</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleUseChallenge(displaySwapped ? 2 : 1); }}
                  className="w-8 h-8 md:w-10 md:h-10 border-2 border-blue-500 rounded-full flex items-center justify-center text-white text-sm md:text-lg hover:bg-blue-900 active:scale-95 transition-all"
                >
                  {chal1}
                </button>
              </div>
              <div className="flex flex-col items-center">
                <span className="mb-0.5 md:mb-1 text-[10px] md:text-xs text-red-400">🔴 CHAL</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleUseChallenge(displaySwapped ? 1 : 2); }}
                  className="w-8 h-8 md:w-10 md:h-10 border-2 border-red-500 rounded-full flex items-center justify-center text-white text-sm md:text-lg hover:bg-red-900 active:scale-95 transition-all"
                >
                  {chal2}
                </button>
              </div>
            </div>
            <div className="text-[10px] md:text-xs text-yellow-500 font-bold flex items-center gap-1">
              <span>Faults:</span>
              <span className="text-white">{faultCount1 + faultCount2}</span>
            </div>
          </div>
        </div>

        {/* ============ RIGHT HALF (Player 2) ============ */}
        <div
          onClick={() => scorePoint(displaySwapped ? 1 : 2)}
          className="flex-1 bg-gradient-to-b from-red-900/40 to-red-950/80 hover:from-red-800/50 hover:to-red-900/80 active:from-red-700/60 cursor-pointer flex flex-col items-center justify-center p-4 md:p-8 transition-all relative"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="w-3 h-3 rounded-full bg-red-400 animate-pulse"></span>
            <span className="text-red-200 font-bold text-lg md:text-2xl">{displaySwapped ? entry1Name : entry2Name}</span>
          </div>
          <div className="text-gray-400 text-xs md:text-sm mb-1">
            SETS: <span className="text-white font-bold">{displaySwapped ? p1Wins : p2Wins}</span>
          </div>
          <div className="text-7xl md:text-9xl font-black text-white drop-shadow-[0_0_30px_rgba(239,68,68,0.3)]">
            {displaySwapped ? score1 : score2}
          </div>
        </div>
      </div>

      {/* Bottom: Match History Log */}
      <div className="h-10 md:h-12 bg-gray-100 w-full flex items-center px-3 md:px-4 overflow-x-auto whitespace-nowrap border-t border-gray-300 shadow-inner z-20 shrink-0 gap-1 md:gap-2" ref={logRef}>
        <span className="text-gray-500 text-[10px] md:text-xs font-bold pr-2 border-r border-gray-300 shrink-0">HISTORY</span>
        {undoStack.map((u, i) => (
          <span key={i} className={`text-[10px] md:text-xs font-bold px-2 py-0.5 rounded shrink-0 ${
            u.score1 > (undoStack[i - 1]?.score1 || 0) ? "bg-blue-100 text-blue-800" : "bg-red-100 text-red-800"
          }`}>
            {u.score1}-{u.score2}
          </span>
        ))}
      </div>

      {/* ========== CARD CONFIRMATION MODALS ========== */}
      {cardStep.step === "yellow_confirm" && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
          <div className="bg-gray-800 rounded-3xl p-6 md:p-8 w-full max-w-sm border border-yellow-500">
            <h2 className="text-2xl font-bold text-yellow-400 mb-4">🟨 Yellow Card</h2>
            <p className="text-gray-400 mb-6">Issue yellow card to {cardStep.target === "entry_1" ? entry1Name : entry2Name}?</p>
            <div className="flex gap-3">
              <button onClick={() => executeCard("yellow")} className="flex-1 bg-yellow-600 text-white py-3 rounded-xl font-bold hover:bg-yellow-500">Confirm</button>
              <button onClick={() => setCardStep(prev => ({ ...prev, step: "none" }))} className="flex-1 bg-gray-700 text-white py-3 rounded-xl font-bold hover:bg-gray-600">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {cardStep.step === "red_confirm" && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
          <div className="bg-gray-800 rounded-3xl p-6 md:p-8 w-full max-w-sm border border-red-500">
            <h2 className="text-2xl font-bold text-red-400 mb-4">🔴 Red Card — {cardStep.target === "entry_1" ? entry1Name : entry2Name}</h2>
            <p className="text-red-300 mb-6">⚠️ Red card will TERMINATE the match for this player!</p>
            <div className="flex gap-3">
              <button onClick={() => setCardStep(prev => ({ ...prev, step: "red_warning" }))} className="flex-1 bg-red-700 text-white py-3 rounded-xl font-bold hover:bg-red-600">Continue</button>
              <button onClick={() => setCardStep(prev => ({ ...prev, step: "none" }))} className="flex-1 bg-gray-700 text-white py-3 rounded-xl font-bold hover:bg-gray-600">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {cardStep.step === "red_warning" && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
          <div className="bg-gray-800 rounded-3xl p-6 md:p-8 w-full max-w-sm border-2 border-red-500">
            <h2 className="text-2xl font-bold text-red-400 mb-2">🔴 FINAL WARNING</h2>
            <p className="text-red-300 text-sm mb-6">Disqualify {cardStep.target === "entry_1" ? entry1Name : entry2Name}? Match will be terminated.</p>
            <div className="flex gap-3">
              <button onClick={() => executeCard("red")} className="flex-1 bg-red-700 text-white py-3 rounded-xl font-bold hover:bg-red-600">Execute</button>
              <button onClick={() => setCardStep(prev => ({ ...prev, step: "none" }))} className="flex-1 bg-gray-700 text-white py-3 rounded-xl font-bold hover:bg-gray-600">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
