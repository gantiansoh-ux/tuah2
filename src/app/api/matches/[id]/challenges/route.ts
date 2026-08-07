import { NextRequest, NextResponse } from "next/server";
import { queryAll, queryOne } from "@/lib/db";
import { CHALLENGES_PER_GAME, getChallengesRemaining } from "@/lib/challenges";

const err = (status: number, error: string, code?: string) =>
  NextResponse.json({ error, ...(code ? { code } : {}) }, { status });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/matches/[id]/challenges — per-match challenge summary for the
 * scoreboard (public read, consistent with GET /api/matches/[id]).
 * - remaining: per player, for the CURRENT game (BWF: 2/game)
 * - success/failed/success_rate: cumulative across the whole match
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return err(404, "Match not found");

  try {
    const match = await queryOne(`SELECT * FROM matches WHERE id = $1`, [id]);
    if (!match) return err(404, "Match not found", "MATCH_NOT_FOUND");

    const games = await queryAll(
      `SELECT * FROM games WHERE match_id = $1 ORDER BY game_number`,
      [id]
    );
    const currentGame = games.find((g: any) => !g.is_complete) || games[games.length - 1] || null;

    const entries = await queryAll(
      `SELECT e.id, e.player_1_id, e.player_2_id,
              COALESCE(p1.full_name, '') AS player_1_name,
              COALESCE(p2.full_name, '') AS player_2_name
       FROM entries e
       LEFT JOIN profiles p1 ON e.player_1_id = p1.id
       LEFT JOIN profiles p2 ON e.player_2_id = p2.id
       WHERE e.id = $1 OR e.id = $2`,
      [match.entry_1_id, match.entry_2_id]
    );
    const e1 = entries.find((e: any) => e.id === match.entry_1_id) || null;
    const e2 = entries.find((e: any) => e.id === match.entry_2_id) || null;

    const challenges = await queryAll(
      `SELECT c.*, COALESCE(p.full_name, '') AS player_name
       FROM challenges c
       LEFT JOIN profiles p ON c.player_id = p.id
       WHERE c.match_id = $1
       ORDER BY c.created_at DESC`,
      [id]
    );

    const playerOf = (entry: any): { id: string; name: string } | null => {
      if (!entry) return null;
      const p1 = entry.player_1_id;
      if (p1 && !entry.player_2_id) return { id: p1, name: entry.player_1_name };
      // Doubles: both players share the entry; expose entry player_1 for stats.
      return { id: p1, name: entry.player_1_name };
    };

    const buildPlayer = async (entry: any, entryId: string | null, sideKey: "1" | "2") => {
      const p = playerOf(entry);
      if (!p || !entryId) return null;
      const own = challenges.filter((c: any) => c.player_id === p.id);
      const decided = own.filter((c: any) => c.status === "decided");
      const success = decided.filter((c: any) => c.result === "overturned").length;
      const failed = decided.filter((c: any) => c.result === "upheld").length;
      const remaining = currentGame
        ? await getChallengesRemaining(currentGame.id, p.id)
        : CHALLENGES_PER_GAME;
      return {
        player_id: p.id,
        name: p.name,
        total: CHALLENGES_PER_GAME,
        used: failed,
        remaining,
        success,
        failed,
        success_rate: success + failed > 0 ? success / (success + failed) : null,
      };
    };

    const players = [
      await buildPlayer(e1, match.entry_1_id, "1"),
      await buildPlayer(e2, match.entry_2_id, "2"),
    ].filter(Boolean);

    return NextResponse.json({ match_id: id, players, challenges });
  } catch (e: any) {
    console.error("Match challenge summary error:", e);
    return err(500, "Failed to load match challenge summary");
  }
}
