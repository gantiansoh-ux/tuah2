import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await query("SELECT role FROM profiles WHERE id = $1", [payload.userId]);
  if (!admin.rows.length || admin.rows[0].role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { role } = await req.json();
    if (!["player", "organizer", "umpire"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    await query("UPDATE profiles SET role = $1 WHERE id = $2", [role, id]);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
