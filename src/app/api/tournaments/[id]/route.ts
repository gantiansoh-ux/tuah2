import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { getPool, query, queryOne, queryAll } from "@/lib/db";

// GET /api/tournaments/[id] - load tournament + categories + entries + matches
// Public endpoint - no auth required (audience portal, spectators)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }
  try {
    const [tournament, categories, matches, games] = await Promise.all([
      queryOne("SELECT * FROM tournaments WHERE id = $1", [id]),
      queryAll("SELECT * FROM categories WHERE tournament_id = $1", [id]),
      queryAll("SELECT * FROM matches WHERE tournament_id = $1 ORDER BY round, match_number", [id]),
      queryAll(
        `SELECT g.* FROM games g
         JOIN matches m ON g.match_id = m.id
         WHERE m.tournament_id = $1
         ORDER BY m.id, g.game_number`,
        [id]
      ),
    ]);

    if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // SEC-3A2-01: entries are role-gated. The public/spectator response only
    // gets a whitelist of non-sensitive columns (name/seed/status); document
    // URLs (ic/passport/student card) and payment fields are only returned to
    // the tournament organizer or an admin. No e.* dump for anonymous users.
    const cookie = req.cookies.get(getCookieName())?.value;
    const payload = cookie ? await verifyToken(cookie) : null;
    const isPrivileged = !!(
      payload &&
      (payload.userId === tournament.organizer_id || payload.role === "admin")
    );

    // Draft tournaments are visible only to the owner (or admin). Other users
    // get 404 so the tournament's existence isn't leaked.
    if (tournament.status === "draft" && !isPrivileged) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Entry columns by role: full row for organizer/admin, whitelist otherwise.
    const entryCols = isPrivileged
      ? `e.id, e.category_id, e.player_1_id, e.player_2_id, e.team_name, e.seed,
         e.status, e.checked_in, e.created_at, e.ic_document_url, e.passport_url,
         e.student_card_url, e.payment_status, e.payment_method, e.payment_reference,
         e.registration_status, e.confirmed_at`
      : `e.id, e.category_id, e.team_name, e.seed, e.status, e.registration_status,
         e.confirmed_at, e.created_at`;
    const entries = await queryAll(
      `SELECT ${entryCols},
              p1.full_name AS player_1_name, p2.full_name AS player_2_name
       FROM entries e
       LEFT JOIN profiles p1 ON e.player_1_id = p1.id
       LEFT JOIN profiles p2 ON e.player_2_id = p2.id
       WHERE e.category_id IN (SELECT id FROM categories WHERE tournament_id = $1)`,
      [id]
    );

    return NextResponse.json({ tournament, categories, matches, entries, games });
  } catch (err: any) {
    console.error("Load tournament error:", err);
    return NextResponse.json({ error: "Failed to load tournament" }, { status: 500 });
  }
}

// PATCH /api/tournaments/[id] - update tournament
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    // Verify ownership
    const existing = await queryOne("SELECT * FROM tournaments WHERE id = $1", [id]);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.organizer_id !== payload.userId && payload.role !== 'admin') {
      return NextResponse.json({ error: "Forbidden — not your tournament" }, { status: 403 });
    }

    let body;
    try { body = await req.json(); } catch { body = {}; }

    // P1-006: validate number_of_courts (integer 1-20) before update
    if (body.number_of_courts !== undefined || body.numberOfCourts !== undefined) {
      const raw = body.number_of_courts ?? body.numberOfCourts;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 20) {
        return NextResponse.json({ error: "number_of_courts must be an integer between 1 and 20" }, { status: 400 });
      }
    }

    // Map allowed fields (supports both camelCase and snake_case, maps to DB column names)
    const fieldMap: Record<string, string> = {
      title: "title", name: "title",
      description: "description",
      venue: "venue", location: "venue",
      start_date: "start_date", startDate: "start_date",
      end_date: "end_date", endDate: "end_date",
      number_of_courts: "number_of_courts", numberOfCourts: "number_of_courts",
      registration_deadline: "registration_deadline", registration_close: "registration_deadline", regClose: "registration_deadline",
      registration_open: "registration_open", regOpen: "registration_open",
    };

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 0;

    // Handle status specially - map "published" to "registration" to match DB check constraint
    let rawStatus = body.status || null;
    if (rawStatus) {
      const statusMapping: Record<string, string> = {
        draft: "draft",
        published: "registration",
        registration: "registration",
        open: "registration",
        in_progress: "in_progress",
        completed: "completed",
        cancelled: "cancelled",
      };
      const mappedStatus = statusMapping[rawStatus] || null;
      if (mappedStatus) {
        idx++;
        updates.push(`status = $${idx}`);
        values.push(mappedStatus);
      }
    }

    // Handle other fields
    for (const [key, value] of Object.entries(body)) {
      if (key === "status") continue; // handled above
      if (value === undefined || value === null) continue;
      const dbField = fieldMap[key];
      if (dbField) {
        // Avoid adding the same field twice
        const existingIdx = updates.findIndex(u => u.startsWith(dbField + " ="));
        if (existingIdx === -1) {
          idx++;
          updates.push(`${dbField} = $${idx}`);
          values.push(value);
        }
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    values.push(id);
    const result = await query(
      `UPDATE tournaments SET ${updates.join(", ")} WHERE id = $${idx + 1} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    return NextResponse.json({ tournament: result.rows[0] });
  } catch (err: any) {
    console.error("Update tournament error:", err);
    return NextResponse.json({ error: "Failed to update tournament" }, { status: 500 });
  }
}

// DELETE /api/tournaments/[id] - delete tournament (owner only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    // Verify ownership
    const check = await queryOne(
      "SELECT id FROM tournaments WHERE id = $1 AND organizer_id = $2",
      [id, payload.userId]
    );
    if (!check) {
      return NextResponse.json({ error: "Tournament not found or not yours" }, { status: 403 });
    }

    // BUG-004 fix (2026-08-07): explicit FK-safe cascade. challenges has NO
    // ON DELETE CASCADE, so naive tournament delete 500s on challenges_match_id_fkey.
    // Order: challenges -> point_logs -> games -> matches -> entries -> categories -> tournament.
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // BUG-004 (2026-08-07): challenges <-> point_logs have a CIRCULAR FK
      // (point_logs.challenge_id -> challenges.id AND challenges.point_log_id -> point_logs.id),
      // neither with CASCADE. NULL out both refs first, then delete children in
      // FK-safe order, then games/matches/entries/categories/tournament.
      await client.query(
        `UPDATE challenges SET point_log_id = NULL WHERE match_id IN (SELECT id FROM matches WHERE tournament_id = $1)`,
        [id]
      );
      await client.query(
        `UPDATE point_logs SET challenge_id = NULL WHERE match_id IN (SELECT id FROM matches WHERE tournament_id = $1)`,
        [id]
      );
      await client.query(
        `DELETE FROM point_logs WHERE match_id IN (SELECT id FROM matches WHERE tournament_id = $1)`,
        [id]
      );
      await client.query(
        `DELETE FROM challenges WHERE match_id IN (SELECT id FROM matches WHERE tournament_id = $1)`,
        [id]
      );
      await client.query(
        `DELETE FROM card_logs WHERE match_id IN (SELECT id FROM matches WHERE tournament_id = $1)`,
        [id]
      );
      await client.query(
        `DELETE FROM games WHERE match_id IN (SELECT id FROM matches WHERE tournament_id = $1)`,
        [id]
      );
      await client.query("DELETE FROM matches WHERE tournament_id = $1", [id]);
      await client.query(
        `DELETE FROM entries WHERE category_id IN (SELECT id FROM categories WHERE tournament_id = $1)`,
        [id]
      );
      // BUG-006 (2026-08-07): tournament_registrations.category_id -> categories
      // has NO cascade - delete registrations BEFORE categories (matches the
      // tournament_id cascade which would already remove most, but category-level
      // ones (by tournament) must go explicitly).
      await client.query(
        `DELETE FROM tournament_registrations WHERE tournament_id = $1`,
        [id]
      );
      await client.query("DELETE FROM categories WHERE tournament_id = $1", [id]);
      // umpire_reviews.tournament_id has NO cascade either - delete before tournament.
      await client.query("DELETE FROM umpire_reviews WHERE tournament_id = $1", [id]);
      await client.query("DELETE FROM tournaments WHERE id = $1", [id]);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Delete tournament error:", err);
    return NextResponse.json({ error: "Failed to delete tournament" }, { status: 500 });
  }
}
