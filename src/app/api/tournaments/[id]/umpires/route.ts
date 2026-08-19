import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne, queryAll } from "@/lib/db";

// POST /api/tournaments/[id]/umpires - organizer explicitly assigns an umpire
//   to this tournament (Q1b, Gan 2026-08-19). body: { umpire_id, available_dates?: string[] }
// DELETE /api/tournaments/[id]/umpires?umpire_id=xxx - remove an assignment
// GET  /api/tournaments/[id]/umpires - list assigned umpires (with profile info)
//
// This is the "assign umpire to tournament on a date" model, independent of the
// invite/apply flow. Assignments surface in the umpire's "My Tournaments" so a
// REAL umpire can find the tournament and open the live scoreboard / umpire pad.

function validateUUID(v: string | null): boolean {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const t = await queryOne("SELECT organizer_id FROM tournaments WHERE id = $1", [id]);
  if (!t) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  if (t.organizer_id !== payload.userId && payload.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await queryAll(
    `SELECT tu.id AS assignment_id, tu.umpire_id, p.full_name, p.email,
            tu.available_dates, tu.created_at AS assigned_at,
            COALESCE(up.availability->>'rate','') AS rate,
            COALESCE(NULLIF(up.certification,''),'') AS certification,
            COALESCE(up.experience_years,0) AS experience_years
     FROM tournament_umpire_assignments tu
     JOIN profiles p ON p.id = tu.umpire_id
     LEFT JOIN umpire_profiles up ON up.profile_id = p.id
     WHERE tu.tournament_id = $1
     ORDER BY p.full_name ASC`,
    [id]
  );
  return NextResponse.json({ assignments: rows });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const t = await queryOne("SELECT organizer_id FROM tournaments WHERE id = $1", [id]);
  if (!t) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  if (t.organizer_id !== payload.userId && payload.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const umpire_id = body.umpire_id;
  if (!validateUUID(umpire_id)) {
    return NextResponse.json({ error: "Valid umpire_id is required" }, { status: 400 });
  }

  // Must be an umpire account
  const u = await queryOne("SELECT id, role, roles FROM profiles WHERE id = $1", [umpire_id]);
  if (!u || (u.role !== "umpire" && !(u.roles || []).includes("umpire"))) {
    return NextResponse.json({ error: "Target is not an umpire account" }, { status: 400 });
  }

  // available_dates: array of 'YYYY-MM-DD'
  let dates: string[] = [];
  if (Array.isArray(body.available_dates)) {
    dates = body.available_dates.filter((d: any) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d));
  }

  // Upsert (unique tournament_id+umpire_id)
  const result = await query(
    `INSERT INTO tournament_umpire_assignments (tournament_id, umpire_id, assigned_by, available_dates)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tournament_id, umpire_id)
     DO UPDATE SET available_dates = EXCLUDED.available_dates, assigned_by = EXCLUDED.assigned_by
     RETURNING *`,
    [id, umpire_id, payload.userId, dates]
  );
  return NextResponse.json({ assignment: result.rows[0] }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const t = await queryOne("SELECT organizer_id FROM tournaments WHERE id = $1", [id]);
  if (!t) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  if (t.organizer_id !== payload.userId && payload.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const umpire_id = req.nextUrl.searchParams.get("umpire_id");
  if (!validateUUID(umpire_id)) {
    return NextResponse.json({ error: "Valid umpire_id is required" }, { status: 400 });
  }

  await query(
    `DELETE FROM tournament_umpire_assignments WHERE tournament_id = $1 AND umpire_id = $2`,
    [id, umpire_id]
  );
  return NextResponse.json({ success: true });
}
