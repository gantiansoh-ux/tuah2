import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { queryAll } from "@/lib/db";

// GET /api/player/my-registrations - Authenticated player's own registrations
// Returns [{ tournament_id, category_id, category_name, status, registered_at }]
// So the player dashboard can show "✓ Joined · <date>" instead of a dead "Join"
// button after they've registered. (Gan 2026-08-19: join must give visible feedback.)
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
      `SELECT r.tournament_id, r.category_id, r.status, r.registered_at,
              c.name AS category_name
       FROM tournament_registrations r
       LEFT JOIN categories c ON r.category_id = c.id
       WHERE r.profile_id = $1
       ORDER BY r.registered_at DESC`,
      [uid]
    );
    return NextResponse.json({ registrations: rows });
  } catch (err: any) {
    console.error("my-registrations error:", err);
    return NextResponse.json({ error: "Failed to load registrations" }, { status: 500 });
  }
}
