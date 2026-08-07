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
