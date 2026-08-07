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
    // Fetch all umpire profiles (role = 'umpire' OR roles array contains 'umpire')
    // Include aggregated rating from umpire_reviews
    const umpires = await queryAll(
      `SELECT p.id, p.full_name, p.email, p.phone,
              COALESCE(AVG(r.rating)::numeric(2,1), 0) AS avg_rating,
              COUNT(r.id)::int AS review_count,
              COUNT(m.id)::int AS matches_umpired
       FROM profiles p
       LEFT JOIN umpire_reviews r ON r.umpire_id = p.id
       LEFT JOIN matches m ON m.umpire_id = p.id
       WHERE p.role = 'umpire' OR 'umpire' = ANY(p.roles)
       GROUP BY p.id, p.full_name, p.email, p.phone
       ORDER BY avg_rating DESC, p.full_name ASC`
    );

    return NextResponse.json({ umpires });
  } catch (err: any) {
    console.error("Umpires GET error:", err);
    return NextResponse.json({ error: "Failed to load umpires" }, { status: 500 });
  }
}
