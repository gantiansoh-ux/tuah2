import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne, queryAll } from "@/lib/db";

// SEC-3A2-06: only the tournament organizer (or an admin) may create matches
// in a tournament. The category must belong to the tournament in the path.
async function canManageTournament(id: string, payload: { userId: string; role: string } | null) {
  if (!payload) return null;
  const tournament = await queryOne("SELECT organizer_id FROM tournaments WHERE id = $1", [id]);
  if (!tournament) return { notFound: true } as any;
  if (payload.role !== "admin" && tournament.organizer_id !== payload.userId) {
    return { forbidden: true } as any;
  }
  return { ok: true } as any;
}

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

  const gate = await canManageTournament(id, payload);
  if (gate?.notFound) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (gate?.forbidden) {
    return NextResponse.json({ error: "Forbidden — not your tournament" }, { status: 403 });
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

    // UAT-E-3 (2026-08-14): boundary guard — a match must never contain the same
    // entry on both sides (self-match). Only applies when BOTH entries are supplied;
    // a bye (one side null) is still allowed.
    if (entry_1_id && entry_2_id && entry_1_id === entry_2_id) {
      return NextResponse.json(
        { error: "A match cannot contain the same entry twice" },
        { status: 400 }
      );
    }

    // SEC-3A2-06: the category must belong to this tournament.
    const cat = await queryOne(
      "SELECT tournament_id FROM categories WHERE id = $1",
      [category_id]
    );
    if (!cat) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    if (cat.tournament_id !== id) {
      return NextResponse.json(
        { error: "category_id does not belong to this tournament" },
        { status: 400 }
      );
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

  const gate = await canManageTournament(id, payload);
  if (gate?.notFound) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (gate?.forbidden) {
    return NextResponse.json({ error: "Forbidden — not your tournament" }, { status: 403 });
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

    // SEC-3A2-06: every category must belong to this tournament.
    const catIds = [...new Set(matches.map((m: any) => m.category_id))];
    const cats = await queryAll(
      "SELECT id, tournament_id FROM categories WHERE id = ANY($1)",
      [catIds]
    );
    const catMap = new Map(cats.map((c: any) => [c.id, c.tournament_id]));
    for (const m of matches) {
      if (catMap.get(m.category_id) !== id) {
        return NextResponse.json(
          { error: `category_id ${m.category_id} does not belong to this tournament` },
          { status: 400 }
        );
      }
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
