import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { category_id, player_1_id, partner_name } = body;

    // Validate required fields
    if (!category_id) {
      return NextResponse.json({ error: "category_id is required" }, { status: 400 });
    }

    // Verify the category exists
    const catCheck = await queryOne(
      `SELECT c.id, c.type, c.tournament_id FROM categories c WHERE c.id = $1`,
      [category_id]
    );
    if (!catCheck) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    // Security: only self-registration is allowed
    // player_1_id must be the logged-in user, or the logged-in user's own id if unspecified
    const entryPlayerId = player_1_id || payload.userId;
    if (entryPlayerId !== payload.userId) {
      return NextResponse.json({ error: "You can only register yourself. Organizers cannot add players directly." }, { status: 403 });
    }

    const isDoubles = catCheck.type === "doubles";

    // For doubles, find or create profile for partner
    let player2Id: string | null = null;
    if (isDoubles) {
      if (!partner_name) {
        return NextResponse.json({ error: "Partner name is required for doubles" }, { status: 400 });
      }
      player2Id = await findOrCreateProfile(partner_name.trim());
    }

    // Check for duplicate entry
    const dupCheck = await queryOne(
      `SELECT id FROM entries WHERE category_id = $1 AND player_1_id = $2 AND registration_status = 'pending'`,
      [category_id, entryPlayerId]
    );
    if (dupCheck) {
      return NextResponse.json({ error: "You are already registered for this category" }, { status: 409 });
    }

    const result = await query(
      `INSERT INTO entries (category_id, player_1_id, player_2_id, registration_status, confirmed_at)
       VALUES ($1, $2, $3, 'pending', NULL) RETURNING *`,
      [category_id, entryPlayerId, player2Id]
    );

    return NextResponse.json({ entry: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    console.error("Create entry error:", err);
    return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
  }
}

async function findOrCreateProfile(fullName: string): Promise<string> {
  const name = fullName.trim();
  if (!name) throw new Error("Empty name");

  // Exact match first
  const existing = await queryOne("SELECT id FROM profiles WHERE full_name = $1", [name]);
  if (existing) return existing.id;

  // Case-insensitive match
  const caseInsensitive = await queryOne("SELECT id FROM profiles WHERE LOWER(full_name) = LOWER($1)", [name]);
  if (caseInsensitive) return caseInsensitive.id;

  // Create new profile for partner
  const email = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@tuah.local`;
  const result = await query(
    `INSERT INTO profiles (email, full_name, role) VALUES ($1, $2, 'player') RETURNING id`,
    [email, name]
  );
  return result.rows[0].id;
}
