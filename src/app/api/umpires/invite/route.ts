import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

// POST /api/umpires/invite - ORGANIZER recruits an umpire to a tournament
// (two-way recruitment, Gan 2026-08-17: umpiress can apply OR be invited.)
// Creates an umpire_applications row with direction='invite', status='pending'.
// The invited umpire then Accepts (-> approved, auto-assigns to unassigned
// matches) or Declines (-> rejected) from their dashboard.
export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { tournament_id, umpire_id, message } = await req.json();
    if (!tournament_id || !umpire_id) {
      return NextResponse.json({ error: "tournament_id and umpire_id are required" }, { status: 400 });
    }

    // Must be the tournament organizer (or admin)
    const tournament = await queryOne(`SELECT organizer_id, status FROM tournaments WHERE id = $1`, [tournament_id]);
    if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    if (tournament.organizer_id !== payload.userId && payload.role !== "admin") {
      return NextResponse.json({ error: "Only the tournament organizer can invite umpires" }, { status: 403 });
    }

    // Target must be an umpire account
    const umpire = await queryOne(`SELECT id, role FROM profiles WHERE id = $1`, [umpire_id]);
    if (!umpire || (umpire.role !== "umpire" && !(umpire.roles || []).includes("umpire"))) {
      return NextResponse.json({ error: "Target is not an umpire account" }, { status: 400 });
    }

    // Prevent duplicate active invite/application
    const existing = await queryOne(
      `SELECT id FROM umpire_applications
       WHERE tournament_id = $1 AND umpire_id = $2 AND status = 'pending'`,
      [tournament_id, umpire_id]
    );
    if (existing) {
      return NextResponse.json({ error: "An invitation/application is already pending for this umpire" }, { status: 409 });
    }

    const result = await query(
      `INSERT INTO umpire_applications (tournament_id, umpire_id, message, direction)
       VALUES ($1, $2, $3, 'invite') RETURNING *`,
      [tournament_id, umpire_id, message || null]
    );

    return NextResponse.json({ application: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    console.error("Umpire invite error:", err);
    return NextResponse.json({ error: "Failed to send invitation" }, { status: 500 });
  }
}
