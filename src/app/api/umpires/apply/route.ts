import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

// POST /api/umpires/apply - umpire applies to umpire a tournament
export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await verifyToken(cookie);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only umpires can apply
  const profile = await queryOne(`SELECT id, role FROM profiles WHERE id = $1`, [payload.userId]);
  if (!profile || (profile.role !== "umpire" && !(profile.roles || []).includes("umpire"))) {
    return NextResponse.json({ error: "Only umpires can apply" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { tournament_id, message } = body;
    if (!tournament_id) {
      return NextResponse.json({ error: "tournament_id is required" }, { status: 400 });
    }

    // Check tournament exists and is open
    const tournament = await queryOne(`SELECT id, status FROM tournaments WHERE id = $1`, [tournament_id]);
    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // Prevent duplicate pending application
    const existing = await queryOne(
      `SELECT id FROM umpire_applications
       WHERE tournament_id = $1 AND umpire_id = $2 AND status = 'pending'`,
      [tournament_id, payload.userId]
    );
    if (existing) {
      return NextResponse.json({ error: "You already applied to this tournament" }, { status: 409 });
    }

    const result = await query(
      `INSERT INTO umpire_applications (tournament_id, umpire_id, message)
       VALUES ($1, $2, $3) RETURNING *`,
      [tournament_id, payload.userId, message || null]
    );

    return NextResponse.json({ application: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    console.error("Umpire apply error:", err);
    return NextResponse.json({ error: "Failed to apply" }, { status: 500 });
  }
}
