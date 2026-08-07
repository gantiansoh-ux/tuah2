import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { canControlMatch } from "@/lib/matchAuth";

export async function POST(req: NextRequest) {
  // SECURITY (#52): require authentication — this audit ledger must not accept
  // anonymous writes.
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await verifyToken(cookie);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { game_id, match_id, scoring_entry_id, action, point_type, player_number } = await req.json();

    if (!game_id) {
      return NextResponse.json({ error: "game_id is required" }, { status: 400 });
    }

    // Resolve the match id (from the game if not provided) and verify the
    // caller is the assigned umpire or the tournament organizer.
    let resolvedMatchId = match_id || null;
    if (!resolvedMatchId) {
      const game = await queryOne(`SELECT match_id FROM games WHERE id = $1`, [game_id]);
      if (game) resolvedMatchId = game.match_id;
    }
    if (resolvedMatchId) {
      const authCheck = await canControlMatch(payload.userId, payload.role, resolvedMatchId);
      if (!authCheck.ok) return authCheck.response;
    } else {
      return NextResponse.json({ error: "match not found for game" }, { status: 404 });
    }

    // scoring_entry_id required only for point-scoring actions; non-scoring
    // logs (shuttle change, challenge, timeout, injury, retirement, walkover,
    // let) don't attribute a point to a specific entry.
    const pt = point_type || action || "normal";
    const SCORING_TYPES = ["normal", "fault", "ace", "double_fault", "replay"];
    // Empty string from the pad UI means "not attributed to a player" -> store NULL
    const scoringEntry = scoring_entry_id ? scoring_entry_id : null;
    if (SCORING_TYPES.includes(pt) && !scoringEntry) {
      return NextResponse.json({ error: "scoring_entry_id is required for scoring actions" }, { status: 400 });
    }

    // Get next point_number
    const countResult = await query(
      `SELECT COUNT(*) as cnt FROM point_logs WHERE game_id = $1`,
      [game_id]
    );
    const pointNumber = (parseInt(countResult.rows[0]?.cnt || "0")) + 1;

    const result = await query(
      `INSERT INTO point_logs (game_id, match_id, point_number, scoring_entry_id, point_type, player_number)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        game_id,
        resolvedMatchId,
        pointNumber,
        scoringEntry,
        pt,
        player_number || null,
      ]
    );

    return NextResponse.json({ pointLog: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    console.error("Create point_log error:", err);
    return NextResponse.json({ error: "Failed to log point" }, { status: 500 });
  }
}
