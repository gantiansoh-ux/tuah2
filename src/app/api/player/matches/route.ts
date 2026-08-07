import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { queryAll } from "@/lib/db";

// GET /api/player/matches - Authenticated player's match history
// Shows every match the user is part of (as player_1 or player_2),
// with opponent name, tournament, category, result and score info.
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await verifyToken(cookie);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uid = payload.userId;

  try {
    const matches = await queryAll(
      `SELECT m.id, m.round, m.match_number, m.status, m.winner_entry_id,
              m.entry_1_id, m.entry_2_id,
              t.id AS tournament_id, t.title AS tournament_title, t.status AS tournament_status,
              c.name AS category_name,
              COALESCE(p1.full_name, '') AS player_1_name,
              COALESCE(p2.full_name, '') AS player_2_name,
              e1.player_1_id AS entry_1_p1, e1.player_2_id AS entry_1_p2,
              e2.player_1_id AS entry_2_p1, e2.player_2_id AS entry_2_p2,
              (SELECT COUNT(*) FROM games g WHERE g.match_id = m.id AND g.is_complete) AS games_completed,
              (SELECT COALESCE(SUM(g.score_1), 0) FROM games g WHERE g.match_id = m.id) AS total_score_1,
              (SELECT COALESCE(SUM(g.score_2), 0) FROM games g WHERE g.match_id = m.id) AS total_score_2
       FROM matches m
       JOIN tournaments t ON m.tournament_id = t.id
       JOIN categories c ON m.category_id = c.id
       LEFT JOIN entries e1 ON m.entry_1_id = e1.id
       LEFT JOIN entries e2 ON m.entry_2_id = e2.id
       LEFT JOIN profiles p1 ON e1.player_1_id = p1.id
       LEFT JOIN profiles p2 ON e2.player_1_id = p2.id
       WHERE e1.player_1_id = $1 OR e1.player_2_id = $1
          OR e2.player_1_id = $1 OR e2.player_2_id = $1
       ORDER BY
         CASE WHEN m.status = 'in_progress' THEN 0
              WHEN m.status = 'scheduled' THEN 1
              ELSE 2 END,
         m.created_at DESC NULLS LAST,
         m.match_number ASC
       LIMIT 100`,
      [uid]
    );

    // Annotate: which side is "me", opponent name, win/loss
    const history = matches.map((m: any) => {
      const isEntry1 =
        m.entry_1_p1 === uid || m.entry_1_p2 === uid;
      const mySide = isEntry1 ? "entry_1" : "entry_2";
      const opponentName = isEntry1 ? m.player_2_name : m.player_1_name;
      const won = m.winner_entry_id && m.winner_entry_id === (isEntry1 ? m.entry_1_id : m.entry_2_id);
      const lost = m.winner_entry_id && !won && m.status === "completed";
      return {
        id: m.id,
        round: m.round,
        match_number: m.match_number,
        status: m.status,
        tournament_id: m.tournament_id,
        tournament_title: m.tournament_title,
        tournament_status: m.tournament_status,
        category_name: m.category_name,
        opponent_name: opponentName || "TBD",
        my_side: mySide,
        result: m.status === "completed" ? (won ? "win" : lost ? "loss" : "draw") : m.status === "in_progress" ? "live" : "upcoming",
        winner_entry_id: m.winner_entry_id,
        games_completed: Number(m.games_completed || 0),
        total_score_1: Number(m.total_score_1 || 0),
        total_score_2: Number(m.total_score_2 || 0),
      };
    });

    return NextResponse.json({ matches: history, count: history.length });
  } catch (err: any) {
    console.error("Player matches error:", err);
    return NextResponse.json({ error: "Failed to load match history" }, { status: 500 });
  }
}
