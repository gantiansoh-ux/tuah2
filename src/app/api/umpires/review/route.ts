import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

// POST /api/umpires/review - organizer rates an umpire (1-5 stars + comment)
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
    const { umpire_id, tournament_id, rating, review } = body;

    if (!umpire_id || !tournament_id || !rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "umpire_id, tournament_id and rating (1-5) required" }, { status: 400 });
    }

    // Verify target is an umpire
    const umpire = await queryOne(`SELECT id, role FROM profiles WHERE id = $1`, [umpire_id]);
    if (!umpire || (umpire.role !== "umpire" && !(umpire.roles || []).includes("umpire"))) {
      return NextResponse.json({ error: "Target is not an umpire" }, { status: 400 });
    }

    // Verify organizer owns the tournament
    const tournament = await queryOne(`SELECT organizer_id FROM tournaments WHERE id = $1`, [tournament_id]);
    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }
    if (tournament.organizer_id !== payload.userId && payload.role !== "admin") {
      return NextResponse.json({ error: "Only the tournament organizer can rate umpires" }, { status: 403 });
    }

    // Insert review (allow multiple reviews over time)
    const result = await query(
      `INSERT INTO umpire_reviews (umpire_id, profile_id, tournament_id, rating, review)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [umpire_id, payload.userId, tournament_id || null, rating, review || null]
    );

    // Return updated average
    const avg = await queryOne(
      `SELECT COALESCE(AVG(rating)::numeric(2,1), 0) AS avg_rating, COUNT(*)::int AS review_count
       FROM umpire_reviews WHERE umpire_id = $1`,
      [umpire_id]
    );

    return NextResponse.json({ review: result.rows[0], avg_rating: avg.avg_rating, review_count: avg.review_count }, { status: 201 });
  } catch (err: any) {
    console.error("Review POST error:", err);
    return NextResponse.json({ error: "Failed to submit review" }, { status: 500 });
  }
}
