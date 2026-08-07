import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { canControlMatch } from "@/lib/matchAuth";

export async function POST(req: NextRequest) {
  // Auth required (this endpoint was previously unauthenticated!)
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await verifyToken(cookie);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, score_entry_1, score_entry_2, status, winner_id, current_server } = body;

    if (!id) {
      return NextResponse.json({ error: "game id is required" }, { status: 400 });
    }

    // Permission check: resolve the game's match, then verify control rights
    const game = await queryOne(`SELECT match_id FROM games WHERE id = $1`, [id]);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }
    const authCheck = await canControlMatch(payload.userId, payload.role, game.match_id);
    if (!authCheck.ok) return authCheck.response;

    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (score_entry_1 !== undefined) {
      sets.push(`score_1 = $${idx}`);
      values.push(score_entry_1);
      idx++;
    }
    if (score_entry_2 !== undefined) {
      sets.push(`score_2 = $${idx}`);
      values.push(score_entry_2);
      idx++;
    }
    if (status !== undefined) {
      const isComplete = status === "completed";
      sets.push(`is_complete = $${idx}`);
      values.push(isComplete);
      idx++;
    }
    if (winner_id !== undefined) {
      sets.push(`winner_id = $${idx}`);
      values.push(winner_id);
      idx++;
    }
    if (current_server !== undefined) {
      sets.push(`current_server = $${idx}`);
      values.push(current_server);
      idx++;
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(id);

    const result = await query(
      `UPDATE games SET ${sets.join(", ")}, updated_at = now() WHERE id = $${idx} RETURNING *`,
      values
    );

    const g = result.rows[0];
    return NextResponse.json({
      game: {
        id: g.id,
        match_id: g.match_id,
        game_number: g.game_number,
        score_entry_1: g.score_1,
        score_entry_2: g.score_2,
        status: g.is_complete ? "completed" : (g.status || "playing"),
        winner_id: g.winner_id,
        current_server: g.current_server ?? 1,
        created_at: g.created_at,
      },
    });
  } catch (err: any) {
    console.error("Update game error:", err);
    return NextResponse.json({ error: "Failed to update game" }, { status: 500 });
  }
}
