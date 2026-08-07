import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query } from "@/lib/db";
import { canControlMatch } from "@/lib/matchAuth";

export async function POST(req: NextRequest) {
  // SECURITY (#52): require authentication — cards must be issued by the
  // assigned umpire or the tournament organizer.
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await verifyToken(cookie);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { match_id, entry_id, card_type, reason, player_number } = await req.json();

    if (!match_id || !entry_id || !card_type) {
      return NextResponse.json({ error: "match_id, entry_id, and card_type are required" }, { status: 400 });
    }

    if (!["yellow", "red"].includes(card_type)) {
      return NextResponse.json({ error: "card_type must be 'yellow' or 'red'" }, { status: 400 });
    }

    // Verify the caller controls this match
    const authCheck = await canControlMatch(payload.userId, payload.role, match_id);
    if (!authCheck.ok) return authCheck.response;

    const result = await query(
      `INSERT INTO card_logs (match_id, entry_id, card_type, reason, player_number)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [match_id, entry_id, card_type, reason || null, player_number || null]
    );

    return NextResponse.json({ cardLog: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    console.error("Create card_log error:", err);
    return NextResponse.json({ error: "Failed to log card" }, { status: 500 });
  }
}
