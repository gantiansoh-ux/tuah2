import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query } from "@/lib/db";
import { canControlMatch } from "@/lib/matchAuth";

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyToken(cookie);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { match_id, game_number } = await req.json();

    if (!match_id || game_number === undefined) {
      return NextResponse.json({ error: "match_id and game_number are required" }, { status: 400 });
    }

    // Permission check: only the assigned umpire or tournament organizer can create games
    const authCheck = await canControlMatch(payload.userId, payload.role, match_id);
    if (!authCheck.ok) return authCheck.response;

    // G11D-12: prevent duplicate games for the same (match, game_number). If the
    // game already exists (e.g. a retried POST), return it instead of inserting a
    // second row with the same game_number.
    const existing = await query(
      `SELECT id, match_id, game_number, score_1 AS score_entry_1, score_2 AS score_entry_2,
              is_complete, winner_id, current_server, created_at FROM games
       WHERE match_id = $1 AND game_number = $2`,
      [match_id, game_number]
    );
    if (existing.rows.length > 0) {
      const ex = existing.rows[0];
      return NextResponse.json({
        game: {
          id: ex.id, match_id: ex.match_id, game_number: ex.game_number,
          score_entry_1: ex.score_entry_1, score_entry_2: ex.score_entry_2,
          status: ex.is_complete ? "completed" : "playing",
          winner_id: ex.winner_id, current_server: ex.current_server, created_at: ex.created_at,
        },
        duplicate: true,
      });
    }

    const result = await query(
      `INSERT INTO games (match_id, game_number, score_1, score_2, is_complete, current_server)
       VALUES ($1, $2, 0, 0, false, 1)
       RETURNING id, match_id, game_number, score_1 AS score_entry_1, score_2 AS score_entry_2,
                 is_complete AS status, winner_id, current_server, created_at`,
      [match_id, game_number]
    );

    const g = result.rows[0];
    return NextResponse.json({
      game: {
        ...g,
        status: g.status ? "completed" : "playing",
      },
    }, { status: 201 });
  } catch (err: any) {
    console.error("Create game error:", err);
    return NextResponse.json({ error: "Failed to create game" }, { status: 500 });
  }
}
