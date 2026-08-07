import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne, queryAll } from "@/lib/db";
import { canControlMatch } from "@/lib/matchAuth";
import {
  getChallengesRemaining,
  countPending,
  resolveChallengerSide,
} from "@/lib/challenges";

const err = (status: number, error: string, code?: string) =>
  NextResponse.json({ error, ...(code ? { code } : {}) }, { status });

/**
 * POST /api/challenges — umpire initiates a line-call challenge.
 * GET  /api/challenges?match_id=&game_id=&status= — list challenges.
 */
export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return err(401, "Unauthorized");
  const payload = await verifyToken(cookie);
  if (!payload) return err(401, "Unauthorized");

  try {
    const { match_id, game_id, point_log_id, player_id, side, contested_call, note } =
      await req.json();

    if (!match_id || !game_id || !player_id || !side || !contested_call) {
      return err(400, "match_id, game_id, player_id, side, contested_call are required");
    }
    if (side !== "left" && side !== "right") return err(400, "side must be left or right", "INVALID_SIDE");
    if (contested_call !== "in" && contested_call !== "out") {
      return err(400, "contested_call must be in or out", "INVALID_CALL");
    }

    const match = await queryOne(`SELECT * FROM matches WHERE id = $1`, [match_id]);
    if (!match) return err(404, "Match not found", "MATCH_NOT_FOUND");
    // Allow challenges while the match is live OR completed (Gan 2026-07-18
    // "Post-Game Undo (Umpire Challenge)": undo/review works even after game
    // and match point; the correction re-evaluates + reverts completion state).
    if (match.status !== "in_progress" && match.status !== "completed") {
      return err(409, "Match is not live", "MATCH_NOT_LIVE");
    }

    // Auth: assigned umpire / tournament organizer / admin (early, before state probes)
    const authCheck = await canControlMatch(payload.userId, payload.role, match_id);
    if (!authCheck.ok) return authCheck.response;

    const game = await queryOne(`SELECT * FROM games WHERE id = $1`, [game_id]);
    if (!game || game.match_id !== match_id) {
      return err(404, "Game not found for this match", "GAME_NOT_FOUND");
    }
    // NOTE: a completed game does NOT block challenges — Gan 2026-07-18
    // "Post-Game Undo (Umpire Challenge)" rule: undo works even after game
    // point; the correction re-evaluates completion state.

    if (point_log_id) {
      const pl = await queryOne(
        `SELECT id FROM point_logs WHERE id = $1 AND game_id = $2`,
        [point_log_id, game_id]
      );
      if (!pl) return err(422, "point_log does not belong to this game", "POINT_LOG_MISMATCH");
    }

    const challengerSide = await resolveChallengerSide(
      match.entry_1_id,
      match.entry_2_id,
      player_id
    );
    if (!challengerSide) {
      return err(422, "Player is not in this match", "PLAYER_NOT_IN_MATCH");
    }

    const pending = await countPending(match_id, game_id);
    if (pending > 0) {
      return err(409, "A challenge is already pending for this game", "CHALLENGE_PENDING_EXISTS");
    }

    const remaining = await getChallengesRemaining(game_id, player_id);
    if (remaining <= 0) {
      return err(409, "No challenges left for this player in this game", "NO_CHALLENGES_LEFT");
    }

    const result = await query(
      `INSERT INTO challenges (match_id, game_id, point_log_id, player_id, side, challenge_type, contested_call, evidence)
       VALUES ($1, $2, $3, $4, $5, 'line_call', $6, $7)
       RETURNING *`,
      [
        match_id,
        game_id,
        point_log_id || null,
        player_id,
        side,
        contested_call,
        note ? { notes: note } : {},
      ]
    );

    return NextResponse.json(
      { ...result.rows[0], remaining_after: remaining },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("Create challenge error:", e);
    return err(500, "Failed to create challenge");
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const match_id = searchParams.get("match_id");
    const game_id = searchParams.get("game_id");
    const status = searchParams.get("status");

    const where: string[] = [];
    const values: any[] = [];
    let idx = 1;

    // Public-read rule (contract §4): anonymous access is allowed ONLY for
    // challenges belonging to a public tournament (registration/published/
    // in_progress/completed) via the match_id filter. An unfiltered global
    // list (or a private/draft tournament) requires a logged-in user.
    let isPublic = false;
    if (match_id) {
      const m = await queryOne(`SELECT m.id, t.status FROM matches m JOIN tournaments t ON m.tournament_id = t.id WHERE m.id = $1`, [match_id]);
      if (m && ["registration", "published", "in_progress", "completed"].includes(m.status)) {
        isPublic = true;
      }
    }
    if (!isPublic) {
      const cookie = req.cookies.get(getCookieName())?.value;
      const payload = cookie ? await verifyToken(cookie) : null;
      if (!payload) return err(401, "Unauthorized");
    }

    if (match_id) {
      where.push(`match_id = $${idx++}`);
      values.push(match_id);
    }
    if (game_id) {
      where.push(`game_id = $${idx++}`);
      values.push(game_id);
    }
    if (status) {
      const VALID = ["pending", "reviewing", "decided", "cancelled"];
      if (!VALID.includes(status)) return err(400, "invalid status", "INVALID_STATUS");
      where.push(`status = $${idx++}`);
      values.push(status);
    }

    const sql =
      `SELECT c.*, COALESCE(p.full_name, '') AS player_name
       FROM challenges c
       LEFT JOIN profiles p ON c.player_id = p.id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY c.created_at DESC`;

    const rows = await queryAll(sql, values);
    return NextResponse.json({ challenges: rows });
  } catch (e: any) {
    console.error("List challenges error:", e);
    return err(500, "Failed to list challenges");
  }
}
