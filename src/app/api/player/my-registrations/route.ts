import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { queryAll } from "@/lib/db";

// GET /api/player/my-registrations - Authenticated player's own registrations
// Returns [{ tournament_id, category_id, category_name, status, registered_at }]
// So the player dashboard can show "✓ Joined · <date>" instead of a dead "Join"
// button after they've registered. (Gan 2026-08-19: join must give visible feedback.)
//
// P1-1 arch: registration state is read from `entries` (the SOLE authority),
// not from the legacy `tournament_registrations` table. This fixes the stale
// "waiting approval" symptom where the player was approved via `entries` but the
// dashboard still read the old table.
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await verifyToken(cookie);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uid = payload.userId;

  try {
    const rows = await queryAll(
      `SELECT c.tournament_id, e.category_id,
              e.registration_status AS status,
              e.status AS entry_status,
              e.created_at AS registered_at,
              c.name AS category_name
       FROM entries e
       JOIN categories c ON e.category_id = c.id
       WHERE e.player_1_id = $1 OR e.player_2_id = $1
       ORDER BY e.created_at DESC`,
      [uid]
    );
    return NextResponse.json({ registrations: rows });
  } catch (err: any) {
    console.error("my-registrations error:", err);
    return NextResponse.json({ error: "Failed to load registrations" }, { status: 500 });
  }
}
