import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne, queryAll } from "@/lib/db";

// GET /api/entries/[id] - get a specific entry
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const entry = await queryOne(
      `SELECT e.*, c.tournament_id, t.organizer_id
       FROM entries e
       JOIN categories c ON e.category_id = c.id
       JOIN tournaments t ON c.tournament_id = t.id
       WHERE e.id = $1`,
      [id]
    );
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    const isOwner = entry.player_1_id === payload.userId || entry.player_2_id === payload.userId;
    const isOrg = entry.organizer_id === payload.userId || payload.role === 'admin';
    if (!isOwner && !isOrg) {
      return NextResponse.json({ error: "Forbidden — not your entry" }, { status: 403 });
    }
    return NextResponse.json({ entry });
  } catch (err: any) {
    console.error("Get entry error:", err);
    return NextResponse.json({ error: "Failed to load entry" }, { status: 500 });
  }
}

// PATCH /api/entries/[id] - update entry fields (e.g. seed, player names)
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
    const entry = await queryOne(
      `SELECT e.*, c.tournament_id, t.organizer_id
       FROM entries e
       JOIN categories c ON e.category_id = c.id
       JOIN tournaments t ON c.tournament_id = t.id
       WHERE e.id = $1`,
      [id]
    );
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    const isOrg = entry.organizer_id === payload.userId || payload.role === 'admin';
    if (!isOrg) {
      return NextResponse.json({ error: "Forbidden — organizer only" }, { status: 403 });
    }
    const body = await req.json();
    const allowedFields = ["seed", "registration_status", "confirmed_at", "payment_status", "player_1_name", "player_2_name"];

    // Handle special case: approving auto-sets confirmed_at
    if (body.registration_status === 'approved') {
      delete body.confirmed_at;
    }

    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(body)) {
      if (allowedFields.includes(key)) {
        if (val !== undefined) {
          if (key === 'registration_status' && val === 'approved') {
            sets.push(`confirmed_at = NOW()`);
          }
          sets.push(`${key} = $${idx}`);
          values.push(val);
          idx++;
        }
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    values.push(id);

    const result = await query(
      `UPDATE entries SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );

    return NextResponse.json({ entry: result.rows[0] });
  } catch (err: any) {
    console.error("Update entry error:", err);
    return NextResponse.json({ error: "Failed to update entry" }, { status: 500 });
  }
}

// DELETE /api/entries/[id] - delete an entry
export async function DELETE(
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
    const entry = await queryOne(
      `SELECT e.*, c.tournament_id, t.organizer_id
       FROM entries e
       JOIN categories c ON e.category_id = c.id
       JOIN tournaments t ON c.tournament_id = t.id
       WHERE e.id = $1`,
      [id]
    );
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    const isOrg = entry.organizer_id === payload.userId || payload.role === 'admin';
    if (!isOrg) {
      return NextResponse.json({ error: "Forbidden — organizer only" }, { status: 403 });
    }
    // Check if the entry is already in an active match
    const matchCheck = await queryOne(
      `SELECT id FROM matches WHERE (entry_1_id = $1 OR entry_2_id = $1) AND status != 'scheduled' LIMIT 1`,
      [id]
    );
    if (matchCheck) {
      return NextResponse.json(
        { error: "Cannot delete player already in an active draw" },
        { status: 400 }
      );
    }

    const result = await query("DELETE FROM entries WHERE id = $1 RETURNING id", [id]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Delete entry error:", err);
    return NextResponse.json({ error: "Failed to delete entry" }, { status: 500 });
  }
}
