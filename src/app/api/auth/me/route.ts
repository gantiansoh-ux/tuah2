import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { queryOne } from "@/lib/db";

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const payload = await verifyToken(cookie);
  if (!payload) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const profile = await queryOne(
    "SELECT id, email, full_name AS name, role FROM profiles WHERE id = $1",
    [payload.userId]
  );

  if (!profile) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({ user: profile });
}
