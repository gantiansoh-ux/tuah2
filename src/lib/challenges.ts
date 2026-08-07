import { query, queryOne } from "@/lib/db";
import { checkGameOver, checkMatchOver } from "@/lib/scoring";

/** BWF: each player has 2 challenges per game; a successful (overturned)
 *  challenge is retained, a failed (upheld) one is consumed. */
export const CHALLENGES_PER_GAME = 2;

/** Remaining challenges for a player in a given game (computed, never stored). */
export async function getChallengesRemaining(
  gameId: string,
  playerId: string
): Promise<number> {
  const r = await queryOne(
    `SELECT COUNT(*)::int AS failed FROM challenges
     WHERE game_id = $1 AND player_id = $2
       AND status = 'decided' AND result = 'upheld'`,
    [gameId, playerId]
  );
  return Math.max(0, CHALLENGES_PER_GAME - (r?.failed ?? 0));
}

/** Is there already an unresolved challenge for this match+game? */
export async function countPending(
  matchId: string,
  gameId: string
): Promise<number> {
  const r = await queryOne(
    `SELECT COUNT(*)::int AS cnt FROM challenges
     WHERE match_id = $1 AND game_id = $2
       AND status IN ('pending', 'reviewing')`,
    [matchId, gameId]
  );
  return r?.cnt ?? 0;
}

/** Which scoring side (1 = entry_1 / score_1, 2 = entry_2 / score_2) the
 *  challenger belongs to. Returns null if the player is not in the match. */
export async function resolveChallengerSide(
  entry1Id: string | null,
  entry2Id: string | null,
  playerId: string
): Promise<1 | 2 | null> {
  for (const [side, entryId] of [
    [1, entry1Id],
    [2, entry2Id],
  ] as const) {
    if (!entryId) continue;
    const e = await queryOne(
      `SELECT player_1_id, player_2_id FROM entries WHERE id = $1`,
      [entryId]
    );
    if (e && (e.player_1_id === playerId || e.player_2_id === playerId)) {
      return side;
    }
  }
  return null;
}

/** Parse categories.scoring_config (string or object) into a config object. */
export function parseScoringConfig(category: any): any {
  if (!category?.scoring_config) return null;
  return typeof category.scoring_config === "string"
    ? JSON.parse(category.scoring_config)
    : category.scoring_config;
}

/**
 * Overturned challenge -> move the contested point to the challenger's side.
 * Runs ALL writes on the caller-provided client (single-connection txn).
 *
 *  1. compensation point_log (audit ledger, point_type='challenge', challenge_id ref)
 *  2. adjust games.score_1 / score_2
 *  3. re-evaluate game completion via scoring.ts
 *  4. if the match was completed but is no longer over -> revert it
 *     (mirrors the "Umpire Challenge revert" block in matches/[id]/route.ts
 *      PATCH — keep both in sync; refactor into a shared lib in Phase 2)
 */
export async function applyOverturnedCorrection(
  client: any,
  challenge: any,
  match: any,
  game: any,
  challengerSide: 1 | 2,
  category: any
): Promise<any> {
  const config = parseScoringConfig(category);

  const scoreBefore = { 1: game.score_1 ?? 0, 2: game.score_2 ?? 0 };
  let score1 = game.score_1 ?? 0;
  let score2 = game.score_2 ?? 0;

  // The contested point_log records which side was awarded the point
  // (player_number 1 = entry_1 side, 2 = entry_2 side).
  let pointLogRow: any = null;
  if (challenge.point_log_id) {
    const pl = await client.query(`SELECT * FROM point_logs WHERE id = $1`, [
      challenge.point_log_id,
    ]);
    pointLogRow = pl.rows[0] || null;
  }
  const awardedSide =
    pointLogRow?.player_number === 1 || pointLogRow?.player_number === 2
      ? pointLogRow.player_number
      : null;

  if (awardedSide === null || awardedSide === challengerSide) {
    // Point not yet awarded (no log) or already on the challenger side:
    // just add the point to the challenger.
    if (challengerSide === 1) score1 += 1;
    else score2 += 1;
  } else {
    // Point was awarded to the opponent -> move it to the challenger.
    if (awardedSide === 1) score1 = Math.max(0, score1 - 1);
    else score2 = Math.max(0, score2 - 1);
    if (challengerSide === 1) score1 += 1;
    else score2 += 1;
  }

  // 1. Compensation audit log (point_type='challenge' is the pre-reserved
  //    non-scoring type; see point_logs/route.ts comment).
  const cnt = await client.query(
    `SELECT COUNT(*)::int AS c FROM point_logs WHERE game_id = $1`,
    [game.id]
  );
  const pointNumber = (cnt.rows[0]?.c ?? 0) + 1;
  const comp = await client.query(
    `INSERT INTO point_logs (game_id, match_id, point_number, scoring_entry_id, point_type, player_number, challenge_id)
     VALUES ($1, $2, $3, NULL, 'challenge', $4, $5)
     RETURNING id`,
    [game.id, match.id, pointNumber, challengerSide, challenge.id]
  );

  // 2. Adjust the persisted score.
  await client.query(
    `UPDATE games SET score_1 = $1, score_2 = $2, updated_at = now() WHERE id = $3`,
    [score1, score2, game.id]
  );

  // 3. Re-evaluate game completion.
  const gameOver = checkGameOver(score1, score2, config);
  if (gameOver.isGameOver) {
    const winnerEntryId =
      gameOver.winner === "player1" ? match.entry_1_id : match.entry_2_id;
    await client.query(
      `UPDATE games SET is_complete = true, winner_id = $1, updated_at = now() WHERE id = $2`,
      [winnerEntryId, game.id]
    );
  } else if (game.is_complete) {
    await client.query(
      `UPDATE games SET is_complete = false, winner_id = NULL, updated_at = now() WHERE id = $1`,
      [game.id]
    );
  }

  // 4. Re-evaluate the match. Three outcomes:
  //    a) was completed but is no longer over -> revert (clear slots, un-complete tournament)
  //    b) is over but the winner CHANGED -> fix winner + re-advance bracket slots
  //    c) just became over through this correction -> record winner (+ advance)
  const m = await client.query(`SELECT * FROM matches WHERE id = $1`, [match.id]);
  const freshMatch = m.rows[0];
  const gs = await client.query(
    `SELECT game_number, is_complete, winner_id FROM games WHERE match_id = $1 ORDER BY game_number`,
    [match.id]
  );
  const gamesForCheck = gs.rows.map((g: any) => ({
    game_number: g.game_number,
    winner:
      g.is_complete
        ? g.winner_id === match.entry_1_id
          ? "player1"
          : g.winner_id === match.entry_2_id
            ? "player2"
            : null
        : null,
  }));
  const matchOver = checkMatchOver(gamesForCheck, config);
  const newWinner =
    matchOver.winner === "player1"
      ? match.entry_1_id
      : matchOver.winner === "player2"
        ? match.entry_2_id
        : null;

  if (freshMatch?.status === "completed") {
    if (!matchOver.isMatchOver) {
      // a) ── Umpire Challenge revert (mirror of matches PATCH) ──
      if (freshMatch.next_match_id && freshMatch.winner_entry_id) {
        await client.query(
          `UPDATE matches SET entry_1_id = NULL WHERE id = $1 AND entry_1_id = $2`,
          [freshMatch.next_match_id, freshMatch.winner_entry_id]
        );
        await client.query(
          `UPDATE matches SET entry_2_id = NULL WHERE id = $1 AND entry_2_id = $2`,
          [freshMatch.next_match_id, freshMatch.winner_entry_id]
        );
      }
      await client.query(
        `UPDATE tournaments SET status = 'in_progress', updated_at = now()
         WHERE id = $1 AND status = 'completed'`,
        [freshMatch.tournament_id]
      );
      if (freshMatch.bracket_group?.startsWith("group-")) {
        await client.query(
          `UPDATE matches SET entry_1_id = NULL, entry_2_id = NULL, winner_entry_id = NULL, status = 'scheduled', updated_at = now()
           WHERE category_id = $1 AND bracket_group = 'ko' AND status != 'completed'`,
          [freshMatch.category_id]
        );
      }
      await client.query(
        `UPDATE matches SET status = 'in_progress', winner_entry_id = NULL, updated_at = now() WHERE id = $1`,
        [match.id]
      );
    } else if (newWinner && newWinner !== freshMatch.winner_entry_id) {
      // b) winner changed: fix the bracket advancement.
      if (freshMatch.next_match_id && freshMatch.winner_entry_id) {
        await client.query(
          `UPDATE matches SET entry_1_id = NULL WHERE id = $1 AND entry_1_id = $2`,
          [freshMatch.next_match_id, freshMatch.winner_entry_id]
        );
        await client.query(
          `UPDATE matches SET entry_2_id = NULL WHERE id = $1 AND entry_2_id = $2`,
          [freshMatch.next_match_id, freshMatch.winner_entry_id]
        );
      }
      if (freshMatch.next_match_id) {
        const tgt = await client.query(`SELECT entry_1_id, entry_2_id FROM matches WHERE id = $1`, [
          freshMatch.next_match_id,
        ]);
        const t = tgt.rows[0];
        if (t) {
          if (!t.entry_1_id) {
            await client.query(
              `UPDATE matches SET entry_1_id = $1, updated_at = now() WHERE id = $2`,
              [newWinner, freshMatch.next_match_id]
            );
          } else if (!t.entry_2_id) {
            await client.query(
              `UPDATE matches SET entry_2_id = $1, updated_at = now() WHERE id = $2`,
              [newWinner, freshMatch.next_match_id]
            );
          }
        }
      }
      await client.query(
        `UPDATE matches SET winner_entry_id = $1, status = 'completed', updated_at = now() WHERE id = $2`,
        [newWinner, match.id]
      );
      // NOTE: Grand Final / GF2 double-final edge cases keep the pad's PATCH
      // flow as source of truth (MVP limitation, documented in CHALLENGE_API.md).
    }
  } else if (freshMatch && matchOver.isMatchOver && newWinner) {
    // c) match just became complete through this correction.
    if (freshMatch.next_match_id) {
      const tgt = await client.query(`SELECT entry_1_id, entry_2_id FROM matches WHERE id = $1`, [
        freshMatch.next_match_id,
      ]);
      const t = tgt.rows[0];
      if (t) {
        if (!t.entry_1_id) {
          await client.query(
            `UPDATE matches SET entry_1_id = $1, updated_at = now() WHERE id = $2`,
            [newWinner, freshMatch.next_match_id]
          );
        } else if (!t.entry_2_id) {
          await client.query(
            `UPDATE matches SET entry_2_id = $1, updated_at = now() WHERE id = $2`,
            [newWinner, freshMatch.next_match_id]
          );
        }
      }
    }
    await client.query(
      `UPDATE matches SET winner_entry_id = $1, status = 'completed', updated_at = now() WHERE id = $2`,
      [newWinner, match.id]
    );
  }

  return {
    correction_point_log_id: comp.rows[0].id,
    score_before: scoreBefore,
    score_after: { 1: score1, 2: score2 },
  };
}
