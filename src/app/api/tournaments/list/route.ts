import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { queryAll } from "@/lib/db";

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyToken(cookie);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tournaments = await queryAll(
      `SELECT id, title, status, venue, start_date, end_date, tournament_type, poster_url, banner_url, logo_url, entry_fee, created_at
       FROM tournaments
       WHERE organizer_id = $1
       ORDER BY created_at DESC`,
      [payload.userId]
    );

    return NextResponse.json({ tournaments });
  } catch (err: any) {
    console.error("List tournaments error:", err);
    return NextResponse.json({ error: "Failed to load tournaments" }, { status: 500 });
  }
}
