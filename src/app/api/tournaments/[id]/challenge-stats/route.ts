import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { queryAll, queryOne } from "@/lib/db";

const err = (status: number, error: string, code?: string) =>
  NextResponse.json({ error, ...(code ? { code } : {}) }, { status });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/tournaments/[id]/challenge-stats — organizer dashboard aggregate:
 * total challenges, overturned/upheld, success rate, per-player breakdown.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return err(404, "Tournament not found");

  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return err(401, "Unauthorized");
  const payload = await verifyToken(cookie);
  if (!payload) return err(401, "Unauthorized");

  try {
    const tournament = await queryOne(`SELECT * FROM tournaments WHERE id = $1`, [id]);
    if (!tournament) return err(404, "Tournament not found", "TOURNAMENT_NOT_FOUND");
    if (payload.role !== "admin" && tournament.organizer_id !== payload.userId) {
      return err(403, "Not authorized", "FORBIDDEN");
    }

    const rows = await queryAll(
      `SELECT c.*, m.tournament_id, COALESCE(p.full_name, '') AS player_name
       FROM challenges c
       JOIN matches m ON c.match_id = m.id
       LEFT JOIN profiles p ON c.player_id = p.id
       WHERE m.tournament_id = $1
       ORDER BY c.created_at DESC`,
      [id]
    );

    const decided = rows.filter((c: any) => c.status === "decided");
    const overturned = decided.filter((c: any) => c.result === "overturned").length;
    const upheld = decided.filter((c: any) => c.result === "upheld").length;

    const byPlayerMap = new Map<string, any>();
    for (const c of decided) {
      const cur = byPlayerMap.get(c.player_id) || {
        player_id: c.player_id,
        name: c.player_name || c.player_id.slice(0, 8),
        total: 0,
        success: 0,
        failed: 0,
      };
      cur.total += 1;
      if (c.result === "overturned") cur.success += 1;
      else cur.failed += 1;
      byPlayerMap.set(c.player_id, cur);
    }
    const by_player = [...byPlayerMap.values()]
      .map((p: any) => ({
        ...p,
        success_rate: p.total > 0 ? p.success / p.total : null,
      }))
      .sort((a: any, b: any) => b.total - a.total);

    return NextResponse.json({
      tournament_id: id,
      total_challenges: rows.length,
      decided,
      overturned,
      upheld,
      success_rate: decided.length > 0 ? overturned / decided.length : null,
      by_player,
    });
  } catch (e: any) {
    console.error("Tournament challenge stats error:", e);
    return err(500, "Failed to load tournament challenge stats");
  }
}
