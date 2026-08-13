import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { getPool, query, queryOne } from "@/lib/db";
import { canControlMatch } from "@/lib/matchAuth";
import { deuceCapFor } from "@/lib/scoring";

// G11-L10/#1: last-seen request token per game (in-memory, TTL). If the same
// client-supplied token for the same game arrives again within a short window,
// treat it as a duplicate (ghost/double-tap retry) and return the prior result
// WITHOUT re-applying. This is a defensive end-to-end guard alongside the UI
// debounce; exact-payload retries are also naturally no-op (delta 0).
const _recentTokens = new Map<string, { at: number }>();
const _TOKEN_TTL_MS = 30000;
const _cleanTokens = () => {
  const cutoff = Date.now() - _TOKEN_TTL_MS;
  for (const [k, v] of _recentTokens) if (v.at < cutoff) _recentTokens.delete(k);
};

export async function POST(req: NextRequest) {
  // Auth required (this endpoint was previously unauthenticated!)
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await verifyToken(cookie);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, score_entry_1, score_entry_2, status, winner_id, current_server, req_id } = body;

    if (!id) {
      return NextResponse.json({ error: "game id is required" }, { status: 400 });
    }

    // Idempotency: a repeat of the same (game, req_id) within TTL is a duplicate.
    if (req_id) {
      const key = `${id}:${req_id}`;
      _cleanTokens();
      if (_recentTokens.has(key)) {
        const g = await queryOne(`SELECT id, match_id, game_number, score_1, score_2, is_complete, winner_id, current_server FROM games WHERE id = $1`, [id]);
        return NextResponse.json({
          duplicate: true,
          game: g ? {
            id: g.id, match_id: g.match_id, game_number: g.game_number,
            score_entry_1: g.score_1, score_entry_2: g.score_2,
            status: g.is_complete ? "completed" : (g.status || "playing"),
            winner_id: g.winner_id, current_server: g.current_server ?? 1, created_at: g.created_at,
          } : null,
        });
      }
      _recentTokens.set(key, { at: Date.now() });
    }

    // Permission check: resolve the game's match, then verify control rights
    const game = await queryOne(`SELECT match_id, score_1, score_2, is_complete FROM games WHERE id = $1`, [id]);
    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }
    const matchRow = await queryOne(`SELECT entry_1_id, entry_2_id FROM matches WHERE id = $1`, [game.match_id]);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }
    const authCheck = await canControlMatch(payload.userId, payload.role, game.match_id);
    if (!authCheck.ok) return authCheck.response;

    // G11D-17b/17c/17d: validate submitted scores server-side.
    // Resolve the category's format to derive the legal deuce ceiling, so the API
    // cannot bypass the engine cap the UI already enforces.
    const catRow = await queryOne(
      `SELECT c.scoring_config FROM matches m
       JOIN categories c ON m.category_id = c.id
       WHERE m.id = $1`,
      [game.match_id]
    );
    let ppg = 21;
    let cap = 30;
    if (catRow?.scoring_config) {
      try {
        const cfg = typeof catRow.scoring_config === "string"
          ? JSON.parse(catRow.scoring_config) : catRow.scoring_config;
        if (cfg?.["points_per_game"]) ppg = Number(cfg["points_per_game"]);
        cap = deuceCapFor(ppg || 21);
      } catch { /* fall back to 21/30 */ }
    }
    const checkScore = (v: unknown, name: string): number | null => {
      if (v === undefined) return null;               // field omitted OK
      if (typeof v === "string" && v.trim() === "") return null;
      const n = Number(v);
      // 17d: non-numeric -> 400 (not 500)
      if (!Number.isFinite(n) || !Number.isInteger(n)) return NaN;
      // 17b: negative -> 400
      if (n < 0) return -1;
      return n;
    };
    for (const [k, v] of [["score_entry_1", score_entry_1], ["score_entry_2", score_entry_2]] as const) {
      const s = checkScore(v, k);
      if (Number.isNaN(s)) return NextResponse.json({ error: `${k} must be a non-negative integer` }, { status: 400 });
      if (s === -1) return NextResponse.json({ error: `${k} cannot be negative` }, { status: 400 });
      // 17c: final/immediate score cannot exceed the format's deuce ceiling
      if (s !== null && s > cap) {
        return NextResponse.json({ error: `${k} (${v}) exceeds the legal maximum of ${cap} for a ${ppg}-point game` }, { status: 400 });
      }
    }

    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (score_entry_1 !== undefined) {
      sets.push(`score_1 = $${idx}`);
      values.push(score_entry_1);
      idx++;
    }
    if (score_entry_2 !== undefined) {
      sets.push(`score_2 = $${idx}`);
      values.push(score_entry_2);
      idx++;
    }
    if (status !== undefined) {
      const isComplete = status === "completed";
      sets.push(`is_complete = $${idx}`);
      values.push(isComplete);
      idx++;
    }
    if (winner_id !== undefined) {
      sets.push(`winner_id = $${idx}`);
      values.push(winner_id);
      idx++;
    }
    if (current_server !== undefined) {
      sets.push(`current_server = $${idx}`);
      values.push(current_server);
      idx++;
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(id);

    // BUG-003 fix (2026-08-07): pad scoring must write the point_logs ledger
    // so challenges can reference the contested point (Post-Game Undo).
    // UAT-E-b (2026-08-13): RECONCILE the ledger to the NEW score, not a delta,
    // so a DOWNWARD correction a) no longer leaves phantom point_logs rows and
    // b) point_logs count always equals the entry's actual score.
    //   - score up   -> insert the missing normal point_logs rows
    //   - score down -> delete the excess trailing normal point_logs rows
    // (Challenge/point-replay integrity depends on this invariant.)
    const prevS1 = game.score_1 ?? 0;
    const prevS2 = game.score_2 ?? 0;
    const newS1 = score_entry_1 !== undefined ? score_entry_1 : prevS1;
    const newS2 = score_entry_2 !== undefined ? score_entry_2 : prevS2;

    const pool = getPool();
    const client = await pool.connect();
    let g: any = null;
    try {
      await client.query('BEGIN');
      const upd = await client.query(
        `UPDATE games SET ${sets.join(", ")}, updated_at = now() WHERE id = $${idx} RETURNING *`,
        values
      );
      g = upd.rows[0];

      // Ledger entries to reconcile: entryId -> target score count
      const targets: Array<{ entryId: string | null; playerNumber: number; target: number }> = [];
      if (matchRow?.entry_1_id) targets.push({ entryId: matchRow.entry_1_id, playerNumber: 1, target: Math.max(0, newS1 ?? 0) });
      if (matchRow?.entry_2_id) targets.push({ entryId: matchRow.entry_2_id, playerNumber: 2, target: Math.max(0, newS2 ?? 0) });
      for (const tgt of targets) {
        const cur = await client.query(
          `SELECT COUNT(*)::int AS c, COALESCE(MAX(point_number),0)::int AS mx
           FROM point_logs WHERE game_id = $1 AND scoring_entry_id = $2 AND point_type = 'normal'`,
          [id, tgt.entryId]
        );
        const have = cur.rows[0]?.c ?? 0;
        const desired = tgt.target;
        if (desired > have) {
          // insert the missing points (point numbers continue after the max)
          let pointNumber = (cur.rows[0]?.mx ?? 0) + 1;
          for (let k = 0; k < desired - have; k++) {
            await client.query(
              `INSERT INTO point_logs (game_id, match_id, point_number, scoring_entry_id, point_type, player_number)
               VALUES ($1, $2, $3, $4, 'normal', $5)`,
              [id, game.match_id, pointNumber, tgt.entryId, tgt.playerNumber]
            );
            pointNumber += 1;
          }
        } else if (desired < have) {
          // UAT-E-b: downward correction -> delete the excess trailing normal rows
          await client.query(
            `DELETE FROM point_logs
             WHERE id IN (
               SELECT id FROM point_logs
               WHERE game_id = $1 AND scoring_entry_id = $2 AND point_type = 'normal'
               ORDER BY point_number DESC
               LIMIT $3
             )`,
            [id, tgt.entryId, have - desired]
          );
        }
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
    return NextResponse.json({
      game: {
        id: g.id,
        match_id: g.match_id,
        game_number: g.game_number,
        score_entry_1: g.score_1,
        score_entry_2: g.score_2,
        status: g.is_complete ? "completed" : (g.status || "playing"),
        winner_id: g.winner_id,
        current_server: g.current_server ?? 1,
        created_at: g.created_at,
      },
    });
  } catch (err: any) {
    console.error("Update game error:", err);
    return NextResponse.json({ error: "Failed to update game" }, { status: 500 });
  }
}
