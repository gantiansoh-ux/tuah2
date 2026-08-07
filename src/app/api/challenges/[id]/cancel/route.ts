import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { canControlMatch } from "@/lib/matchAuth";

const err = (status: number, error: string, code?: string) =>
  NextResponse.json({ error, ...(code ? { code } : {}) }, { status });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/challenges/[id]/cancel — umpire cancels an unresolved challenge.
 * No challenge count consumed, no score change.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return err(404, "Challenge not found");

  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return err(401, "Unauthorized");
  const payload = await verifyToken(cookie);
  if (!payload) return err(401, "Unauthorized");

  try {
    const challenge = await queryOne(`SELECT * FROM challenges WHERE id = $1`, [id]);
    if (!challenge) return err(404, "Challenge not found", "CHALLENGE_NOT_FOUND");
    if (challenge.status !== "pending" && challenge.status !== "reviewing") {
      return err(409, "Challenge is not pending", "CHALLENGE_STATE_CONFLICT");
    }

    const authCheck = await canControlMatch(payload.userId, payload.role, challenge.match_id);
    if (!authCheck.ok) return authCheck.response;

    const result = await query(
      `UPDATE challenges SET status = 'cancelled' WHERE id = $1 RETURNING *`,
      [id]
    );
    return NextResponse.json(result.rows[0]);
  } catch (e: any) {
    console.error("Cancel challenge error:", e);
    return err(500, "Failed to cancel challenge");
  }
}
