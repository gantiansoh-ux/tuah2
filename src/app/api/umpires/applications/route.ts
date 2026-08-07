import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryAll, queryOne } from "@/lib/db";

// GET /api/umpires/applications?tournament_id= - organizer views applications
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await verifyToken(cookie);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tournamentId = req.nextUrl.searchParams.get("tournament_id");
  if (!tournamentId) {
    return NextResponse.json({ error: "tournament_id is required" }, { status: 400 });
  }

  try {
    // Verify requester owns the tournament (or is admin)
    const tournament = await queryOne(`SELECT organizer_id FROM tournaments WHERE id = $1`, [tournamentId]);
    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }
    if (tournament.organizer_id !== payload.userId && payload.role !== "admin") {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const applications = await queryAll(
      `SELECT a.id, a.message, a.status, a.created_at,
              p.id AS umpire_id, p.full_name, p.email, p.phone,
              COALESCE(AVG(r.rating)::numeric(2,1), 0) AS avg_rating,
              COUNT(DISTINCT r.id)::int AS review_count
       FROM umpire_applications a
       JOIN profiles p ON a.umpire_id = p.id
       LEFT JOIN umpire_reviews r ON r.umpire_id = p.id
       WHERE a.tournament_id = $1
       GROUP BY a.id, p.id, p.full_name, p.email, p.phone
       ORDER BY
         CASE WHEN a.status = 'pending' THEN 0 ELSE 1 END,
         a.created_at ASC`,
      [tournamentId]
    );

    return NextResponse.json({ applications });
  } catch (err: any) {
    console.error("Applications GET error:", err);
    return NextResponse.json({ error: "Failed to load applications" }, { status: 500 });
  }
}

// POST /api/umpires/applications - approve/reject application
// body: { id, action: "approve" | "reject" }
//
// ⚠️ INTENTIONAL BEHAVIOR (do not "fix" without Gan's explicit sign-off):
// Approving an umpire application AUTOMATICALLY ASSIGNS that umpire to EVERY
// unassigned scheduled/in-progress match of the tournament:
//   UPDATE matches SET umpire_id = $1
//   WHERE tournament_id = $2 AND umpire_id IS NULL AND status IN ('scheduled','in_progress')
// This was a deliberate product decision by Gan (2026-08): "approve = auto-fill all
// unassigned matches". It is NOT a bug. If behavior must change (e.g. per-match
// assignment only), get explicit approval from Gan first. See also:
//   - Bug A (2026-08-03): CSV import dedup - entries/import/route.ts
//   - Known side effect: matches with empty bracket slots (NULL entry_1/entry_2, e.g.
//     byes or future rounds) also get an umpire assigned - accepted under this decision.
export async function POST(req: NextRequest) {
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
    const { id, action } = body;
    if (!id || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "id and action (approve|reject) required" }, { status: 400 });
    }

    // Load application + verify organizer
    const application = await queryOne(
      `SELECT a.id, a.tournament_id, a.umpire_id, a.status
       FROM umpire_applications a
       JOIN tournaments t ON a.tournament_id = t.id
       WHERE a.id = $1`,
      [id]
    );
    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const tournament = await queryOne(`SELECT organizer_id FROM tournaments WHERE id = $1`, [application.tournament_id]);
    if (tournament.organizer_id !== payload.userId && payload.role !== "admin") {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    // Approve -> assign this umpire to all unassigned scheduled matches of the tournament
    // (INTENTIONAL per Gan 2026-08 - see header comment; do not remove)
    if (action === "approve") {
      await query(
        `UPDATE matches SET umpire_id = $1, updated_at = now()
         WHERE tournament_id = $2 AND umpire_id IS NULL AND status IN ('scheduled', 'in_progress')`,
        [application.umpire_id, application.tournament_id]
      );
    }

    const result = await query(
      `UPDATE umpire_applications SET status = $1 WHERE id = $2 RETURNING *`,
      [newStatus, id]
    );

    return NextResponse.json({ application: result.rows[0] });
  } catch (err: any) {
    console.error("Application POST error:", err);
    return NextResponse.json({ error: "Failed to update application" }, { status: 500 });
  }
}
