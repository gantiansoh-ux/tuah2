import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { queryOne, query } from "@/lib/db";
import { canControlMatch } from "@/lib/matchAuth";

// DELETE /api/games/[id] - remove a stale empty game (e.g. auto-created game
// that became orphaned after an umpire undid the winning point).
// Safety: only deletes games with 0-0 score that are NOT completed.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await verifyToken(cookie);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const game = await queryOne(`SELECT * FROM games WHERE id = $1`, [id]);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // Only umpire/organizer of the match may delete
    const authCheck = await canControlMatch(payload.userId, payload.role, game.match_id);
    if (!authCheck.ok) return authCheck.response;

    // Safety: never delete a completed game or a game with points on the board
    if (game.is_complete) {
      return NextResponse.json({ error: "Cannot delete a completed game" }, { status: 400 });
    }
    if ((game.score_1 ?? 0) !== 0 || (game.score_2 ?? 0) !== 0) {
      return NextResponse.json({ error: "Cannot delete a game with points" }, { status: 400 });
    }

    await query(`DELETE FROM games WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("Delete game error:", err);
    return NextResponse.json({ error: "Failed to delete game" }, { status: 500 });
  }
}
