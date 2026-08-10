import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { checkRegistrationAllowed } from "@/lib/registration";

// GET /api/tournament_registrations?tournament_id=xxx
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const tournament_id = req.nextUrl.searchParams.get("tournament_id");
    if (!tournament_id) return NextResponse.json({ error: "tournament_id required" }, { status: 400 });

    // SEC-3A2-03: registration lists (with player emails) are private to the
    // tournament organizer (or an admin). Any other role gets 403.
    const tournament = await queryOne(
      "SELECT organizer_id FROM tournaments WHERE id = $1",
      [tournament_id]
    );
    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }
    if (payload.role !== "admin" && tournament.organizer_id !== payload.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await query(
      `SELECT r.*, p.full_name AS player_name, p.email AS player_email
       FROM tournament_registrations r
       LEFT JOIN profiles p ON r.profile_id = p.id
       WHERE r.tournament_id = $1
       ORDER BY r.registered_at DESC`,
      [tournament_id]
    );

    return NextResponse.json({ registrations: result.rows });
  } catch (err: any) {
    console.error("List registrations error:", err);
    return NextResponse.json({ error: "Failed to load registrations" }, { status: 500 });
  }
}

// POST /api/tournament_registrations
export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { tournament_id, category_id } = await req.json();
    if (!tournament_id) return NextResponse.json({ error: "tournament_id required" }, { status: 400 });

    // Registration gate: tournament existence, status, window, category capacity (BUG-010-reg)
    const gate = await checkRegistrationAllowed(tournament_id, category_id || null);
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const existing = await query(
      `SELECT id FROM tournament_registrations WHERE tournament_id = $1 AND profile_id = $2 AND status IN ('pending', 'approved')`,
      [tournament_id, payload.userId]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "Already registered" }, { status: 409 });
    }

    const result = await query(
      `INSERT INTO tournament_registrations (tournament_id, profile_id, category_id, status) VALUES ($1, $2, $3, 'pending') RETURNING *`,
      [tournament_id, payload.userId, category_id || null]
    );

    return NextResponse.json({ registration: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    console.error("Create registration error:", err);
    return NextResponse.json({ error: "Failed to register" }, { status: 500 });
  }
}
