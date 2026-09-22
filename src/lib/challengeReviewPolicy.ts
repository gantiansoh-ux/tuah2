// ============================================================================
// P0-4 (CHALLENGE SELF-REVIEW) — authoritative challenge-review guards
// [NOT DEPLOYED] Remediation branch p0-remediation only.
// ----------------------------------------------------------------------------
// Root defects fixed here (see TUAH_Audit/p0-remediation/evidence/P0-4-challenge):
//   D1. No reviewer != challenger authority  -> self-review possible.
//   D2. point_log_id optional -> null/missing mints a free point to challenger.
//   D3. No idempotency guard on review (relies on status transition only).
//   D4. Reviewing a terminal (completed) match silently reopens it.
//
// Design: a challenge must carry a RESOLVABLE point_log_id that belongs to the
// SAME game/match, and the review must be performed by an authority that is
// NOT the challenger. The point is always re-targeted to the side that the
// contested point_log was actually awarded to (never assumed).
// ============================================================================

/** Challenge-review policy errors carry an HTTP status + code for the route. */
export class ChallengePolicyError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Roles permitted to review a challenge (create-time authority is matchAuth). */
export const REVIEWER_ROLES = ["umpire", "organizer", "admin"];

/**
 * D1 — a challenge can never be reviewed by its own creator/challenger.
 *
 * IMPORTANT (representability limit): the `challenges` table has NO
 * `created_by` column — only `player_id` (the player who challenged) and a
 * nullable `reviewed_by` written at review time. Therefore "the umpire who
 * OPENED the challenge must not also REVIEW it" (the audit's B-FAIL-2
 * "single-umpire self-review") is NOT representable from the row alone.
 *
 * Two additive guards are applied here:
 *   1. the reviewer's identity must not equal `challenges.player_id`
 *      (blocks a participant reviewing their own challenge);
 *   2. unless the reviewer is an admin, the reviewer must not be the
 *      match's assigned umpire when that umpire ALSO appears as a player in
 *      the match (dual-role self-review).
 *
 * Full enforcement (reviewer != the authority that created the challenge)
 * REQUIRES the `created_by`/`initiated_by` migration documented in the P0-4
 * report. This function is the interim additive defence and is idempotent /
 * side-effect free.
 */
export function assertDistinctReviewer(
  challenge: { player_id: string },
  review: { userId: string; role: string }
): void {
  if (challenge.player_id === review.userId && review.role !== "admin") {
    throw new ChallengePolicyError(
      403,
      "SELF_REVIEW_FORBIDDEN",
      "A challenge cannot be reviewed by the challenger"
    );
  }
}

/**
 * D1b — dual-role guard: an umpire who is also the assigned umpire of the
 * match may review, but must never review when they are ALSO a participant
 * in that match. `playerInMatch` is computed by the caller from
 * resolveChallengerSide().
 */
export function assertUmpireNotAlsoPlayer(
  review: { userId: string; role: string },
  opts: { isAssignedUmpire: boolean; playerInMatch: boolean }
): void {
  if (opts.isAssignedUmpire && opts.playerInMatch && review.role !== "admin") {
    throw new ChallengePolicyError(
      403,
      "DUAL_ROLE_REVIEW_FORBIDDEN",
      "An umpire participating in this match cannot review its challenges"
    );
  }
}

/**
 * D2 — a point_log_id is MANDATORY and must belong to THIS game+match.
 * The candidate rows are re-validated against the isolated/live DB by the
 * caller (needs a client); this pure helper handles the shape checks so the
 * logic is unit-testable and identical in both modes.
 */
export function assertResolvablePointLog(
  pointLogId: unknown,
  pointLogRow: { id: string; game_id: string; match_id: string } | null,
  challenge: { game_id: string; match_id: string }
): void {
  if (typeof pointLogId !== "string" || pointLogId.length === 0) {
    throw new ChallengePolicyError(
      400,
      "POINT_LOG_REQUIRED",
      "point_log_id is required to open or review a challenge"
    );
  }
  if (!pointLogRow) {
    throw new ChallengePolicyError(
      422,
      "POINT_LOG_NOT_FOUND",
      "point_log_id does not reference an existing point log"
    );
  }
  if (
    pointLogRow.game_id !== challenge.game_id ||
    pointLogRow.match_id !== challenge.match_id
  ) {
    throw new ChallengePolicyError(
      422,
      "POINT_LOG_MISMATCH",
      "point_log does not belong to this challenge's game/match"
    );
  }
}

/**
 * D4 — reject a review that would reopen a terminal match.
 * Policy: a challenge review must NOT transition a `completed` match back to
 * `in_progress`. Terminal results are immutable via this endpoint; reopening
 * requires an explicit, separately-audited admin action (out of scope here).
 */
export function assertMatchNotTerminal(
  match: { status: string },
  opts: { allowReopen?: boolean } = {}
): void {
  if (!opts.allowReopen && match.status === "completed") {
    throw new ChallengePolicyError(
      409,
      "MATCH_TERMINAL",
      "Cannot review a challenge for a completed match"
    );
  }
}

/**
 * D2b — resolve the award target from the CONTESTED point log, never by
 * assumption. Returns the side (1|2) the contested point currently belongs to,
 * or null when the log does not carry a scoring side.
 */
export function resolveAwardedSide(pointLogRow: any): 1 | 2 | null {
  const pn = pointLogRow?.player_number;
  return pn === 1 || pn === 2 ? pn : null;
}
