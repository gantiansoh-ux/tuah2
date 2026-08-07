import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

    const {
      category_id,
      entry_1_id,
      entry_2_id,
      next_match_id,
      round,
      match_number,
      status,
      court_name,
    } = body;

    if (!category_id) {
      return NextResponse.json({ error: "category_id is required" }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO matches (tournament_id, category_id, entry_1_id, entry_2_id, next_match_id, round, match_number, status, court_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id,
        category_id,
        entry_1_id || null,
        entry_2_id || null,
        next_match_id || null,
        round || "Round 1",
        match_number || 1,
        status || "scheduled",
        court_name || null,
      ]
    );

    return NextResponse.json({ match: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    console.error("Create match error:", err);
    return NextResponse.json({ error: "Failed to create match" }, { status: 500 });
  }
}

// Also support POST to /api/tournaments/[id]/matches for bulk
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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
    const { matches } = body;

    if (!Array.isArray(matches) || matches.length === 0) {
      return NextResponse.json({ error: "matches array is required" }, { status: 400 });
    }

    // Validate every match has a category_id -> 400 instead of a DB 500
    const missingCat = matches.findIndex((m: any) => !m || !m.category_id);
    if (missingCat !== -1) {
      return NextResponse.json(
        { error: `matches[${missingCat}].category_id is required` },
        { status: 400 }
      );
    }

    const created: any[] = [];
    for (const m of matches) {
      const result = await query(
        `INSERT INTO matches (tournament_id, category_id, entry_1_id, entry_2_id, next_match_id, round, match_number, status, court_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          id,
          m.category_id,
          m.entry_1_id || null,
          m.entry_2_id || null,
          m.next_match_id || null,
          m.round || "Round 1",
          m.match_number || 1,
          m.status || "scheduled",
          m.court_name || null,
        ]
      );
      created.push(result.rows[0]);
    }

    return NextResponse.json({ matches: created }, { status: 201 });
  } catch (err: any) {
    console.error("Bulk create matches error:", err);
    return NextResponse.json({ error: "Failed to create matches" }, { status: 500 });
  }
}
