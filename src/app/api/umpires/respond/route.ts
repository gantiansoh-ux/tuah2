import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

// POST /api/umpires/respond - an INVITED umpire accepts or declines a tournament
// invitation (direction='invite'). Two-way recruitment (Gan 2026-08-17).
// body: { id, action: "accept" | "decline" }
// Accepting sets status='approved' (and, matching the existing approve flow,
// auto-assigns this umpire to unassigned scheduled matches of the tournament).
export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, action } = await req.json();
    if (!id || !["accept", "decline"].includes(action)) {
      return NextResponse.json({ error: "id and action (accept|decline) required" }, { status: 400 });
    }

    // Load the invite; must belong to this umpire and be an invite + pending
    const invite = await queryOne(
      `SELECT id, tournament_id, umpire_id, status, direction FROM umpire_applications WHERE id = $1`,
      [id]
    );
    if (!invite) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    if (invite.umpire_id !== payload.userId) {
      return NextResponse.json({ error: "Not your invitation" }, { status: 403 });
    }
    if (invite.status !== "pending") {
      return NextResponse.json({ error: "This invitation is already resolved" }, { status: 409 });
    }
    // Only invites are responded-to this way (self-applications are resolved by organizer)
    if (invite.direction !== "invite") {
      return NextResponse.json({ error: "This is an application, not an invitation" }, { status: 400 });
    }

    const newStatus = action === "accept" ? "approved" : "rejected";

    if (action === "accept") {
      await query(
        `UPDATE matches SET umpire_id = $1, updated_at = now()
         WHERE tournament_id = $2 AND umpire_id IS NULL AND status IN ('scheduled', 'in_progress')`,
        [invite.umpire_id, invite.tournament_id]
      );
    }

    const result = await query(
      `UPDATE umpire_applications SET status = $1 WHERE id = $2 RETURNING *`,
      [newStatus, id]
    );

    return NextResponse.json({ application: result.rows[0] });
  } catch (err: any) {
    console.error("Umpire respond error:", err);
    return NextResponse.json({ error: "Failed to respond to invitation" }, { status: 500 });
  }
}
