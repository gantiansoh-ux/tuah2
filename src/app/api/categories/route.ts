import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query } from "@/lib/db";

// BUG-001 fix (2026-08-03): gender passthrough could violate
// categories_gender_check (male/female/mixed/any). Normalize + whitelist.

const GENDER_MAP: Record<string, string> = {
  mens: "male",
  womens: "female",
  mixed: "mixed",
  open: "any",
  male: "male",
  female: "female",
  any: "any",
};

// POST /api/categories - create a new category
export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { tournament_id, name, type, gender, scoring_config, max_entries, format } = body;

    if (!tournament_id || !name) {
      return NextResponse.json({ error: "tournament_id and name are required" }, { status: 400 });
    }

    // Verify ownership
    const ownerCheck = await query(
      "SELECT id FROM tournaments WHERE id = $1 AND organizer_id = $2",
      [tournament_id, payload.userId]
    );
    if (ownerCheck.rows.length === 0) {
      return NextResponse.json({ error: "Tournament not found or not owned by you" }, { status: 403 });
    }

    // BUG-001: normalize + validate gender (invalid -> 400, not 500)
    const normalizedGender = gender ? GENDER_MAP[gender] : "any";
    if (gender && !normalizedGender) {
      return NextResponse.json({
        error: `Invalid category gender: '${gender}'. Must be one of: ${Object.keys(GENDER_MAP).join(', ')}`,
      }, { status: 400 });
    }

    const sc = scoring_config || { points_per_game: 21, best_of: 3, deuce: true, deuce_cap: 30, serve_switch: 5 };
    if (format) {
      sc.format = format;
    }

    const result = await query(
      `INSERT INTO categories (tournament_id, name, type, gender, scoring_config, max_entries)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tournament_id, name, type || "singles", normalizedGender, JSON.stringify(sc), max_entries || (type === "doubles" ? 32 : 64)]
    );

    return NextResponse.json({ category: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    console.error("Create category error:", err);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}

// GET /api/categories?tournament_id=xxx - list categories
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const tournament_id = req.nextUrl.searchParams.get("tournament_id");
    if (!tournament_id) {
      return NextResponse.json({ error: "tournament_id query param required" }, { status: 400 });
    }

    const result = await query(
      "SELECT * FROM categories WHERE tournament_id = $1 ORDER BY name",
      [tournament_id]
    );

    return NextResponse.json({ categories: result.rows });
  } catch (err: any) {
    console.error("List categories error:", err);
    return NextResponse.json({ error: "Failed to load categories" }, { status: 500 });
  }
}
