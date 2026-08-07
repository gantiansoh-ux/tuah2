import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { getPool, queryOne } from "@/lib/db";
import { canControlMatch } from "@/lib/matchAuth";
import {
  resolveChallengerSide,
  parseScoringConfig,
  applyOverturnedCorrection,
} from "@/lib/challenges";

const err = (status: number, error: string, code?: string) =>
  NextResponse.json({ error, ...(code ? { code } : {}) }, { status });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/challenges/[id]/review — umpire/official records the IN/OUT
 * decision. All writes run in ONE transaction (single pooled client):
 * challenge state + (if overturned) point correction + completion re-eval.
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

  let client: any = null;
  try {
    const { decision, evidence } = await req.json();
    if (!decision || (decision !== "in" && decision !== "out")) {
      return err(400, "decision must be in or out", "INVALID_DECISION");
    }

    const challenge = await queryOne(`SELECT * FROM challenges WHERE id = $1`, [id]);
    if (!challenge) return err(404, "Challenge not found", "CHALLENGE_NOT_FOUND");
    if (challenge.status !== "pending" && challenge.status !== "reviewing") {
      return err(409, "Challenge is not pending", "CHALLENGE_STATE_CONFLICT");
    }

    const authCheck = await canControlMatch(payload.userId, payload.role, challenge.match_id);
    if (!authCheck.ok) return authCheck.response;
    const match = authCheck.match;

    const game = await queryOne(`SELECT * FROM games WHERE id = $1`, [challenge.game_id]);
    if (!game) return err(404, "Game not found", "GAME_NOT_FOUND");

    const category = match.category_id
      ? await queryOne(`SELECT * FROM categories WHERE id = $1`, [match.category_id])
      : null;
    const config = parseScoringConfig(category);

    const result = decision === challenge.contested_call ? "upheld" : "overturned";
    const ev = evidence && typeof evidence === "object" ? evidence : {};

    let correction: any = null;

    client = await getPool().connect();
    await client.query("BEGIN");

    if (result === "overturned") {
      const challengerSide = await resolveChallengerSide(
        match.entry_1_id,
        match.entry_2_id,
        challenge.player_id
      );
      if (!challengerSide) {
        await client.query("ROLLBACK");
        client.release();
        client = null;
        return err(422, "Challenger is not in this match", "PLAYER_NOT_IN_MATCH");
      }
      correction = await applyOverturnedCorrection(
        client,
        challenge,
        match,
        game,
        challengerSide,
        category
      );
    }

    await client.query(
      `UPDATE challenges
       SET decision = $1, result = $2, status = 'decided', evidence = $3,
           reviewed_by = $4, reviewed_at = now()
       WHERE id = $5
       RETURNING *`,
      [decision, result, ev, payload.userId, id]
    );

    await client.query("COMMIT");
    client.release();
    client = null;

    const fresh = await queryOne(`SELECT * FROM challenges WHERE id = $1`, [id]);
    return NextResponse.json({ challenge: fresh, point_correction: correction });
  } catch (e: any) {
    console.error("Review challenge error:", e);
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        /* ignore */
      }
      client.release();
    }
    return err(500, "Failed to review challenge");
  }
}
