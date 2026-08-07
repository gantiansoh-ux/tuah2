import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne, queryAll } from "@/lib/db";

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
    const [tournament, categories, matches, entries, games] = await Promise.all([
      queryOne("SELECT * FROM tournaments WHERE id = $1", [id]),
      queryAll("SELECT * FROM categories WHERE tournament_id = $1", [id]),
      queryAll("SELECT * FROM matches WHERE tournament_id = $1 ORDER BY round, match_number", [id]),
      queryAll(
        `SELECT e.*, p1.full_name AS player_1_name, p2.full_name AS player_2_name
         FROM entries e
         LEFT JOIN profiles p1 ON e.player_1_id = p1.id
         LEFT JOIN profiles p2 ON e.player_2_id = p2.id
         WHERE e.category_id IN (SELECT id FROM categories WHERE tournament_id = $1)`,
        [id]
      ),
      queryAll(
        `SELECT g.* FROM games g
         JOIN matches m ON g.match_id = m.id
         WHERE m.tournament_id = $1
         ORDER BY m.id, g.game_number`,
        [id]
      ),
    ]);

    if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Draft tournaments are visible only to the owner (or admin). Other users
    // get 404 so the tournament's existence isn't leaked.
    if (tournament.status === "draft") {
      const cookie = req.cookies.get(getCookieName())?.value;
      const payload = cookie ? await verifyToken(cookie) : null;
      const isOwner = payload && (payload.userId === tournament.organizer_id || payload.role === "admin");
      if (!isOwner) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

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

    // Map allowed fields (supports both camelCase and snake_case, maps to DB column names)
    const fieldMap: Record<string, string> = {
      title: "title", name: "title",
      description: "description",
      venue: "venue", location: "venue",
      start_date: "start_date", startDate: "start_date",
      end_date: "end_date", endDate: "end_date",
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

    // Delete (cascades to categories, entries, matches, games, etc.)
    await query("DELETE FROM tournaments WHERE id = $1", [id]);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Delete tournament error:", err);
    return NextResponse.json({ error: "Failed to delete tournament" }, { status: 500 });
  }
}
