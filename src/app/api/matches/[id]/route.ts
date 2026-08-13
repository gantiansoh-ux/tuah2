import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne, queryAll } from "@/lib/db";
import { canControlMatch } from "@/lib/matchAuth";
import {
  deriveGroups,
  computeGroupStandings,
  buildKOPairings,
} from "@/lib/groupStandings";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  try {
    const match = await queryOne(`SELECT * FROM matches WHERE id = $1`, [id]);
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // SEC-3A2-02: entries in the match response are role-gated.
    // Anonymous spectators can still read the match (audience portal / QR page
    // call this route without auth), but only get whitelisted columns. Document
    // URLs and payment fields are only returned to the tournament organizer, an
    // admin, or the participants of this match themselves.
    const organizer = await queryOne(
      `SELECT organizer_id, status FROM tournaments WHERE id = $1`,
      [match.tournament_id]
    );
    const cookie = req.cookies.get(getCookieName())?.value;
    const payload = cookie ? await verifyToken(cookie) : null;
    const isPrivileged = !!(
      payload &&
      (payload.role === "admin" ||
        (organizer && payload.userId === organizer.organizer_id))
    );

    // F-01 (GATE-3): draft tournaments are visible only to their owner (or an
    // admin). Everyone else gets the SAME 404 shape as a missing match so the
    // draft tournament's existence (and its matches) is not leaked — consistent
    // with tournaments/[id] draft -> 404 semantics (no oracle).
    if (organizer?.status === "draft" && !isPrivileged) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const games = await queryAll(
      `SELECT * FROM games WHERE match_id = $1 ORDER BY game_number`,
      [id]
    );

    const cardLogs = await queryAll(
      `SELECT * FROM card_logs WHERE match_id = $1 ORDER BY issued_at`,
      [id]
    );

    const pointLogs = await queryAll(
      `SELECT id, game_id, point_number, scoring_entry_id, point_type, player_number, timestamp
       FROM point_logs WHERE match_id = $1 ORDER BY timestamp`,
      [id]
    );

    let category = null;
    if (match.category_id) {
      category = await queryOne(`SELECT * FROM categories WHERE id = $1`, [match.category_id]);
      if (category && typeof category.scoring_config === "string") {
        category.scoring_config = JSON.parse(category.scoring_config);
      } else if (category && typeof category.scoring_config === "object") {
        category.scoring_config = category.scoring_config;
      }
    }

    // Whitelist columns for the public view. player_1_id/player_2_id are still
    // selected server-side for the participant check below, then stripped from
    // the public response.
    const entries = await queryAll(
      `SELECT e.id, e.category_id, e.player_1_id, e.player_2_id, e.team_name,
              e.seed, e.status, e.registration_status, e.confirmed_at, e.created_at,
              COALESCE(p1.full_name, '') as player_1_name,
              COALESCE(p2.full_name, '') as player_2_name
       FROM entries e
       LEFT JOIN profiles p1 ON e.player_1_id = p1.id
       LEFT JOIN profiles p2 ON e.player_2_id = p2.id
       WHERE e.id = $1 OR e.id = $2`,
      [match.entry_1_id, match.entry_2_id]
    );

    const isParticipant = !!(
      payload &&
      entries.some(
        (e: any) => e.player_1_id === payload.userId || e.player_2_id === payload.userId
      )
    );

    let entriesOut: any[];
    if (isPrivileged) {
      // Organizer/admin see sensitive columns for BOTH entries (unchanged).
      const sensitive = await queryAll(
        `SELECT e.id, e.ic_document_url, e.passport_url, e.student_card_url,
                e.payment_status, e.payment_method, e.payment_reference
         FROM entries e WHERE e.id = $1 OR e.id = $2`,
        [match.entry_1_id, match.entry_2_id]
      );
      entriesOut = entries.map((e: any) => {
        const s = sensitive.find((x: any) => x.id === e.id);
        return s ? { ...e, ...s } : e;
      });
    } else if (isParticipant) {
      // SEC-3A2-02: a participant sees sensitive columns ONLY for the entry
      // that belongs to them (player_1_id or player_2_id == caller). The
      // opponent's identity docs and payment data are NOT exposed.
      const sensitive = await queryAll(
        `SELECT e.id, e.ic_document_url, e.passport_url, e.student_card_url,
                e.payment_status, e.payment_method, e.payment_reference
         FROM entries e WHERE e.id = $1 OR e.id = $2`,
        [match.entry_1_id, match.entry_2_id]
      );
      entriesOut = entries.map((e: any) => {
        const belongsToCaller =
          (payload.userId && e.player_1_id === payload.userId) ||
          (payload.userId && e.player_2_id === payload.userId);
        if (!belongsToCaller) return e;
        const s = sensitive.find((x: any) => x.id === e.id);
        return s ? { ...e, ...s } : e;
      });
    } else {
      // Strip internal profile ids from the public view (no PII leakage).
      entriesOut = entries.map(({ player_1_id, player_2_id, ...rest }: any) => rest);
    }

    const e1 = entriesOut.find((e: any) => e.id === match.entry_1_id);
    const e2 = entriesOut.find((e: any) => e.id === match.entry_2_id);
    const sideName = (e: any) =>
      e?.player_2_name ? `${e.player_1_name} / ${e.player_2_name}` : (e?.player_1_name || "");

    return NextResponse.json({
      match: {
        ...match,
        player_1_name: sideName(e1),
        player_2_name: sideName(e2),
      },
      games: games.map((g: any) => ({
        id: g.id,
        match_id: g.match_id,
        game_number: g.game_number,
        score_entry_1: g.score_1 ?? g.score_entry_1 ?? 0,
        score_entry_2: g.score_2 ?? g.score_entry_2 ?? 0,
        status: g.is_complete ? "completed" : (g.status || "playing"),
        winner_id: g.winner_id,
        current_server: g.current_server ?? 1,
        created_at: g.created_at,
      })),
      cardLogs,
      pointLogs,
      category,
      entries: entriesOut,
    });
  } catch (err: any) {
    console.error("Get match error:", err);
    return NextResponse.json({ error: "Failed to load match" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

    // Permission check: only the assigned umpire or tournament organizer can update a match
    const authCheck = await canControlMatch(payload.userId, payload.role, id);
    if (!authCheck.ok) return authCheck.response;

    // P3 (umpire reassignment): only the tournament organizer or an admin may
    // CHANGE who the assigned umpire is. The assigned umpire can do everything
    // else on the match (status, scores, winner, court) but must not be able to
    // reassign umpire_id to redirect the match to someone else.
    const wantsUmpireChange = Object.prototype.hasOwnProperty.call(body, "umpire_id");
    const isOrganizerOrAdmin = payload.role === "admin" ||
      (authCheck.match && authCheck.match.organizer_id === payload.userId);
    if (wantsUmpireChange && !isOrganizerOrAdmin) {
      return NextResponse.json(
        { error: "Not authorized - only the tournament organizer can reassign the umpire" },
        { status: 403 }
      );
    }

    // P1-006: court+time conflict guard. When both court_number and scheduled_time
    // are being set, reject if another match in the SAME tournament already holds
    // the same court at the same time slot (discrete slots => equality = overlap).
    const bodyCourt = body.court_number ?? body.courtNumber;
    const bodyTime = body.scheduled_time ?? body.scheduledTime;
    if (bodyCourt !== undefined && bodyTime !== undefined) {
      const cur = await queryOne(
        `SELECT tournament_id FROM matches WHERE id = $1`,
        [id]
      );
      if (cur?.tournament_id) {
        const clash = await queryOne(
          `SELECT id, match_number, court_number, scheduled_time FROM matches
           WHERE tournament_id = $1 AND court_number = $2 AND scheduled_time = $3 AND id != $4
           LIMIT 1`,
          [cur.tournament_id, Number(bodyCourt), new Date(String(bodyTime)).toISOString(), id]
        );
        if (clash) {
          return NextResponse.json(
            { error: "Court already scheduled at this time (conflict with match " + clash.match_number + ")" },
            { status: 409 }
          );
        }
      }
    }

    const allowedFields: Record<string, string> = {
      status: "status",
      winner_id: "winner_entry_id",
      winner_entry_id: "winner_entry_id",
      umpire_id: "umpire_id",
      court_name: "court_name",
      court_number: "court_number",
      notes: "notes",
      scheduled_time: "scheduled_time",
      next_match_id: "next_match_id",
      toss_winner_entry_id: "toss_winner_entry_id",
      toss_chose_side: "toss_chose_side",
    };

    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(body)) {
      const dbCol = allowedFields[key];
      if (dbCol && val !== undefined) {
        let finalVal = val;
        // Map frontend status names to DB values
        if (key === 'status' && val === 'playing') finalVal = 'in_progress';
        sets.push(`${dbCol} = $${idx}`);
        values.push(finalVal);
        idx++;
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Snapshot the PRE-UPDATE state for Umpire Challenge revert logic
    const prevRow = await queryOne(`SELECT * FROM matches WHERE id = $1`, [id]);

    sets.push(`updated_at = now()`);
    values.push(id);

    const result = await query(
      `UPDATE matches SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );

    // Auto-advance winner + loser logic (supports both winner_id and winner_entry_id aliases)
    const advanceWinner = body.winner_id || body.winner_entry_id;
    if (body.status === 'completed' && advanceWinner) {
      const currentMatch = result.rows[0];
      const advanceLoser = currentMatch.entry_1_id === advanceWinner
        ? currentMatch.entry_2_id
        : currentMatch.entry_1_id;

      const fillSlot = async (targetId: string | null, entryId: string | null) => {
        if (!targetId || !entryId) return;
        const target = await queryOne(
          `SELECT entry_1_id, entry_2_id, round, status FROM matches WHERE id = $1`,
          [targetId]
        );
        if (!target) return;
        // Never overwrite an existing slot; fill first empty one.
        if (!target.entry_1_id) {
          await query(`UPDATE matches SET entry_1_id = $1 WHERE id = $2`, [entryId, targetId]);
        } else if (!target.entry_2_id) {
          await query(`UPDATE matches SET entry_2_id = $1 WHERE id = $2`, [entryId, targetId]);
        }
      };

      const isGrandFinal = currentMatch.round === 'Grand Final' || currentMatch.round === 'Grand Final (2nd)';

      if (isGrandFinal) {
        if (currentMatch.round === 'Grand Final') {
          // WB champ sits in entry_1 (from WB Final winner), LB champ in entry_2 (from LB).
          // If entry_1 (WB champ) wins -> tournament over.
          // If entry_2 (LB champ) wins -> play GF2: winner vs loser.
          const gf2 = currentMatch.loser_match_id; // points at GF2
          if (advanceWinner === currentMatch.entry_1_id) {
            // WB champ wins GF - tournament complete
            await query(
              `UPDATE tournaments SET status = 'completed', updated_at = now() WHERE id = $1`,
              [currentMatch.tournament_id]
            );
          } else if (advanceWinner === currentMatch.entry_2_id && gf2) {
            // LB champ wins GF - GF2 needed: winner (e1) vs loser (e2)
            await query(
              `UPDATE matches SET entry_1_id = $1, entry_2_id = $2, status = 'scheduled', updated_at = now() WHERE id = $3`,
              [advanceWinner, advanceLoser, gf2]
            );
          }
        } else {
          // GF2 winner is champion -> tournament complete
          await query(
            `UPDATE tournaments SET status = 'completed', updated_at = now() WHERE id = $1`,
            [currentMatch.tournament_id]
          );
        }
      } else {
        // Normal bracket match: advance winner to next match, loser to loser match (DE)
        await fillSlot(currentMatch.next_match_id, advanceWinner);
        await fillSlot(currentMatch.loser_match_id, advanceLoser);
      }
    }

    // ── #47: Group+KO — when a group match completes, auto-fill the knockout
    // stage once ALL group matches are done (cross-group pairings A1-B2, ...) ──
    const completedRow = result.rows[0];
    if (
      completedRow &&
      completedRow.status === "completed" &&
      completedRow.bracket_group?.startsWith("group-")
    ) {
      try {
        await maybeFillGroupKnockout(completedRow.category_id);
      } catch (fillErr: any) {
        console.error("Group+KO fill error:", fillErr);
      }
    }

    // Auto-complete tournament when all matches are done (non-DE safety net)
    // #47: ignore unfillable null-null KO placeholders (e.g. whole group withdrew)
    // #50: runs AFTER group→KO fill so a freshly-filled KO stage is never
    //      miscounted as "nothing left" (premature COMPLETED bug).
    if (body.status === 'completed') {
      const updatedMatch = result.rows[0];
      const remaining = await query(
        `SELECT COUNT(*)::int AS cnt FROM matches
         WHERE tournament_id = $1 AND status != 'completed'
         AND NOT (bracket_group = 'ko' AND entry_1_id IS NULL AND entry_2_id IS NULL)`,
        [updatedMatch.tournament_id]
      );
      if (remaining.rows[0].cnt === 0) {
        await query(
          `UPDATE tournaments SET status = 'completed', updated_at = now() WHERE id = $1`,
          [updatedMatch.tournament_id]
        );
      }
    }

    // ── Umpire Challenge revert: match was completed, now being reopened ──
    // Undo after game point (even after match over) must revert:
    // match status + winner, the auto-advanced slot in next match, and tournament status.
    const newRow = result.rows[0];
    const wasCompleted = prevRow?.status === 'completed';
    const isReopened = wasCompleted && newRow?.status !== 'completed';
    if (isReopened && prevRow) {
      // 1. Clear the winner slot that was auto-advanced into the next match.
      // #51: clear BY VALUE (whichever slot actually holds the winner) instead of
      // by bracket parity — completion order can put a winner in the non-parity
      // slot (first-empty fill), leaving a stale winner behind otherwise.
      if (prevRow.next_match_id && prevRow.winner_entry_id) {
        await query(
          `UPDATE matches SET entry_1_id = NULL WHERE id = $1 AND entry_1_id = $2`,
          [prevRow.next_match_id, prevRow.winner_entry_id]
        );
        await query(
          `UPDATE matches SET entry_2_id = NULL WHERE id = $1 AND entry_2_id = $2`,
          [prevRow.next_match_id, prevRow.winner_entry_id]
        );
      }
      // 2. Revert tournament auto-complete (only if it was auto-completed)
      await query(
        `UPDATE tournaments SET status = 'in_progress', updated_at = now()
         WHERE id = $1 AND status = 'completed'`,
        [prevRow.tournament_id]
      );
      // 3. #47: reopening a GROUP match clears the knockout stage fills
      // (not-yet-played KO matches only; played ones are kept)
      if (prevRow.bracket_group?.startsWith("group-")) {
        await query(
          `UPDATE matches SET entry_1_id = NULL, entry_2_id = NULL, winner_entry_id = NULL, status = 'scheduled', updated_at = now()
           WHERE category_id = $1 AND bracket_group = 'ko' AND status != 'completed'`,
          [prevRow.category_id]
        );
      }
    }

    return NextResponse.json({ match: result.rows[0] });
  } catch (err: any) {
    console.error("Update match error:", err);
    return NextResponse.json({ error: "Failed to update match" }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// #47: Group+Knockout fill — called after every group-match completion.
// When ALL group matches of the category are completed, computes standings,
// builds cross-group pairings and fills the empty KO first-round slots.
// Single-entry slots (byes) are auto-completed and winners advanced.
// Idempotent: never overwrites existing fills; skips completed matches.
// ────────────────────────────────────────────────────────────────────────────

async function maybeFillGroupKnockout(categoryId: string): Promise<void> {
  const cat = await queryOne(`SELECT * FROM categories WHERE id = $1`, [categoryId]);
  if (!cat) return;
  let config: any = null;
  if (cat.scoring_config) {
    config =
      typeof cat.scoring_config === "string"
        ? JSON.parse(cat.scoring_config)
        : cat.scoring_config;
  }
  if (config?.format !== "group_knockout") return;
  const numGroups = config.numGroups || 4;
  const advance = config.advance ?? 2;

  const all = await queryAll(
    `SELECT * FROM matches WHERE category_id = $1 ORDER BY match_number`,
    [categoryId]
  );
  const groupMatches = all.filter((m: any) => m.bracket_group?.startsWith("group-"));
  const koMatches = all.filter((m: any) => m.bracket_group === "ko");
  if (groupMatches.length === 0 || koMatches.length === 0) return;
  if (!groupMatches.every((m: any) => m.status === "completed")) return;

  const entries = await queryAll(
    `SELECT e.*, COALESCE(p1.full_name,'') AS player_1_name, COALESCE(p2.full_name,'') AS player_2_name
     FROM entries e
     LEFT JOIN profiles p1 ON e.player_1_id = p1.id
     LEFT JOIN profiles p2 ON e.player_2_id = p2.id
     WHERE e.category_id = $1
     AND (e.registration_status IS NULL OR e.registration_status != 'rejected')`,
    [categoryId]
  );
  const games = await queryAll(
    `SELECT g.* FROM games g JOIN matches m ON g.match_id = m.id
     WHERE m.category_id = $1 AND m.bracket_group LIKE 'group-%' ORDER BY g.match_id, g.game_number`,
    [categoryId]
  );
  const gamesByMatch = new Map<string, any[]>();
  for (const g of games) {
    const arr = gamesByMatch.get(g.match_id) || [];
    arr.push(g);
    gamesByMatch.set(g.match_id, arr);
  }

  const entryInfos = entries.map((e: any) => ({
    entry_id: e.id,
    seed: e.seed,
    withdrawn: e.status === "withdrawn",
    name: e.player_2_name
      ? `${e.player_1_name} / ${e.player_2_name}`
      : e.player_1_name || e.id.slice(0, 8),
  }));
  const derived = deriveGroups(entryInfos, numGroups, groupMatches);
  const withGames = groupMatches.map((m: any) => ({
    ...m,
    games: gamesByMatch.get(m.id) || [],
  }));
  const standings = computeGroupStandings(derived, withGames);
  const pairs = buildKOPairings(standings, advance);

  const koR1 = koMatches
    .filter((m: any) => m.round_index === 0)
    .sort((a: any, b: any) => a.match_number - b.match_number);

  // Fill empty KO R1 slots (never overwrite existing/played matches)
  for (let i = 0; i < koR1.length; i++) {
    const m = koR1[i];
    if (m.status === "completed") continue;
    const p = pairs[i] || { e1: null, e2: null };
    await query(
      `UPDATE matches SET entry_1_id = $1, entry_2_id = $2, updated_at = now() WHERE id = $3`,
      [p.e1?.entry_id ?? null, p.e2?.entry_id ?? null, m.id]
    );
  }

  // Auto-complete single-entry KO R1 slots (byes) and advance the winner
  for (const m of koR1) {
    const fresh = await queryOne(`SELECT * FROM matches WHERE id = $1`, [m.id]);
    if (!fresh || fresh.status === "completed") continue;
    const hasE1 = !!fresh.entry_1_id;
    const hasE2 = !!fresh.entry_2_id;
    if (hasE1 !== hasE2) {
      const winner = hasE1 ? fresh.entry_1_id : fresh.entry_2_id;
      await query(
        `UPDATE matches SET status = 'completed', winner_entry_id = $1, updated_at = now() WHERE id = $2`,
        [winner, m.id]
      );
      if (fresh.next_match_id) {
        const target = await queryOne(`SELECT * FROM matches WHERE id = $1`, [fresh.next_match_id]);
        if (target) {
          if (!target.entry_1_id) {
            await query(`UPDATE matches SET entry_1_id = $1, updated_at = now() WHERE id = $2`, [winner, target.id]);
          } else if (!target.entry_2_id) {
            await query(`UPDATE matches SET entry_2_id = $1, updated_at = now() WHERE id = $2`, [winner, target.id]);
          }
        }
      }
    }
  }
}
