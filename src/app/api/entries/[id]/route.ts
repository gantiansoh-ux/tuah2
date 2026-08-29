import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne, withTransaction } from "@/lib/db";
import { checkCategoryCapacity } from "@/lib/registration";

const ENTRY_STATUS_ALLOWED = ["registered", "confirmed", "withdrawn", "disqualified"];

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

// PATCH /api/entries/[id] - update entry fields (organizer only)
// P1-1 arch: adds authoritative `status` transitions (registered|confirmed|
// withdrawn|disqualified) on top of the existing seed/payment/approval fields.
// Every state change is a SINGLE transactional write to `entries` (HARD GUARD).
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
    const allowedFields = [
      "seed",
      "registration_status",
      "confirmed_at",
      "payment_status",
      "player_1_name",
      "player_2_name",
      "status", // P1-1 arch: participation status (registered|confirmed|withdrawn|disqualified)
    ];

    // Handle special case: approving auto-sets confirmed_at
    if (body.registration_status === 'approved') {
      delete body.confirmed_at;
    }

    // A withdrawn / disqualified participant cannot be approved (decision #2/#3:
    // approval adds an `AND status='registered'` guard).
    if (body.registration_status === 'approved' || body.registration_status === 'rejected') {
      if (body.registration_status === 'approved' && entry.status === 'withdrawn') {
        return NextResponse.json(
          { error: "Cannot approve a withdrawn entry" },
          { status: 409 }
        );
      }
      if (entry.status === 'disqualified') {
        return NextResponse.json(
          { error: "Cannot change registration_status of a disqualified entry (terminal)" },
          { status: 409 }
        );
      }
    }

    // BUG-012: capacity gate on approval (exclude this entry — already counted as pending)
    if (body.registration_status === 'approved') {
      const cap = await checkCategoryCapacity(entry.category_id, { excludeEntryId: entry.id });
      if (!cap.allowed) {
        return NextResponse.json({ error: cap.error }, { status: cap.status });
      }
    }

    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;

    // Validate/whitelist `status` values when present.
    if (body.status !== undefined) {
      if (!ENTRY_STATUS_ALLOWED.includes(body.status)) {
        return NextResponse.json(
          { error: `status must be one of: ${ENTRY_STATUS_ALLOWED.join(", ")}` },
          { status: 400 }
        );
      }
    }

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

    // P1-1 arch: ONE transaction, ONE authoritative write to entries.
    const result = await withTransaction(async (client) => {
      const r = await client.query(
        `UPDATE entries SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
        values
      );
      return r.rows[0];
    });

    return NextResponse.json({ entry: result });
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
