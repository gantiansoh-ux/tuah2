import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { getPool, queryOne } from "@/lib/db";
import { canControlMatch } from "@/lib/matchAuth";
import {
  resolveChallengerSide,
  parseScoringConfig,
  applyOverturnedCorrection,
} from "@/lib/challenges";
import {
  ChallengePolicyError,
  assertDistinctReviewer,
  assertMatchNotTerminal,
  assertResolvablePointLog,
  assertUmpireNotAlsoPlayer,
} from "@/lib/challengeReviewPolicy";

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

    // P0-4 (D1): the reviewer must not be the challenger themselves.
    // (Interim additive guard — see REQUIRED MIGRATION for created_by.)
    try {
      assertDistinctReviewer(challenge, { userId: payload.userId, role: payload.role });
    } catch (pe: any) {
      if (pe instanceof ChallengePolicyError) return err(pe.status, pe.message, pe.code);
      throw pe;
    }

    const authCheck = await canControlMatch(payload.userId, payload.role, challenge.match_id);
    if (!authCheck.ok) return authCheck.response;
    const match = authCheck.match;

    // P0-4 (D1b): dual-role guard — an umpire who is assigned to this match
    // may not review if they are ALSO a participant in it.
    const reviewerInMatch = await resolveChallengerSide(
      match.entry_1_id,
      match.entry_2_id,
      payload.userId
    );
    try {
      assertUmpireNotAlsoPlayer(
        { userId: payload.userId, role: payload.role },
        { isAssignedUmpire: match.umpire_id === payload.userId, playerInMatch: !!reviewerInMatch }
      );
    } catch (pe: any) {
      if (pe instanceof ChallengePolicyError) return err(pe.status, pe.message, pe.code);
      throw pe;
    }

    // P0-4 (D4): a completed match is terminal for this endpoint; do not
    // silently reopen it by applying a challenge correction.
    try {
      assertMatchNotTerminal(match);
    } catch (pe: any) {
      if (pe instanceof ChallengePolicyError) return err(pe.status, pe.message, pe.code);
      throw pe;
    }

    // P0-4 (D2): the contested point_log must be present and belong to this
    // challenge's game+match before any correction is computed.
    if (challenge.point_log_id) {
      const pl = await queryOne(
        `SELECT id, game_id, match_id FROM point_logs WHERE id = $1`,
        [challenge.point_log_id]
      );
      try {
        assertResolvablePointLog(challenge.point_log_id, pl as any, {
          game_id: challenge.game_id,
          match_id: challenge.match_id,
        });
      } catch (pe: any) {
        if (pe instanceof ChallengePolicyError) return err(pe.status, pe.message, pe.code);
        throw pe;
      }
    } else {
      return err(
        422,
        "point_log_id is required to review a challenge",
        "POINT_LOG_REQUIRED"
      );
    }

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
