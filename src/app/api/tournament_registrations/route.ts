import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

// ============================================================
// /api/tournament_registrations — READ-ONLY LEGACY ADAPTER (P1-1 arch wave)
// ------------------------------------------------------------------
// The `tournament_registrations` table is demoted to legacy read-only/history
// (Decision #5: kept temporarily, NOT deleted). `entries` is the SOLE
// registration authority.
//
// HARD GUARD: this route must have ZERO live writers. The POST (register) and
// PATCH (approve/reject) handlers no longer perform ANY state write; they
// return 410 with a pointer to the unified registration endpoint so no residual
// caller can silently write or silently fail. Only the historic GET read is kept.
// ============================================================

// GET /api/tournament_registrations?tournament_id=xxx  (read-only legacy history)
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

    return NextResponse.json({
      registrations: result.rows,
      legacy: true,
    });
  } catch (err: any) {
    console.error("List registrations error:", err);
    return NextResponse.json({ error: "Failed to load registrations" }, { status: 500 });
  }
}

// POST /api/tournament_registrations — READ-ONLY (NO STATE WRITE)
// Registration now flows through POST /api/tournaments/[id]/register.
// This handler refuses to write and returns 410 so any residual caller is told
// exactly where registration moved (HARD GUARD: no silent write, no fake success).
export async function POST(req: NextRequest) {
  return NextResponse.json(
    {
      error: "Registration moved to POST /api/tournaments/[id]/register. This legacy endpoint is read-only (no state is written).",
    },
    { status: 410 }
  );
}
