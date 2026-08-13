import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { getPool, query, queryOne } from "@/lib/db";
import { canControlMatch } from "@/lib/matchAuth";

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
    // Deltas computed against previous persisted scores, then ONE transaction:
    // UPDATE games + INSERT point_logs for each added point.
    const prevS1 = game.score_1 ?? 0;
    const prevS2 = game.score_2 ?? 0;
    const newS1 = score_entry_1 !== undefined ? score_entry_1 : prevS1;
    const newS2 = score_entry_2 !== undefined ? score_entry_2 : prevS2;
    const delta1 = Math.max(0, (newS1 ?? 0) - prevS1);
    const delta2 = Math.max(0, (newS2 ?? 0) - prevS2);

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

      // ledger: one point_log per added point (normal type, attributed to entry)
      const pointEntries: Array<{ entryId: string | null; playerNumber: number; count: number }> = [];
      if (delta1 > 0 && matchRow?.entry_1_id) pointEntries.push({ entryId: matchRow.entry_1_id, playerNumber: 1, count: delta1 });
      if (delta2 > 0 && matchRow?.entry_2_id) pointEntries.push({ entryId: matchRow.entry_2_id, playerNumber: 2, count: delta2 });
      if (pointEntries.length > 0) {
        const cnt = await client.query(`SELECT COUNT(*)::int AS c FROM point_logs WHERE game_id = $1`, [id]);
        let pointNumber = (cnt.rows[0]?.c ?? 0) + 1;
        for (const pe of pointEntries) {
          for (let k = 0; k < pe.count; k++) {
            await client.query(
              `INSERT INTO point_logs (game_id, match_id, point_number, scoring_entry_id, point_type, player_number)
               VALUES ($1, $2, $3, $4, 'normal', $5)`,
              [id, game.match_id, pointNumber, pe.entryId, pe.playerNumber]
            );
            pointNumber += 1;
          }
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
