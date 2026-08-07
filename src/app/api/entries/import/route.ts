import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

// POST /api/entries/import - bulk import entries from CSV text (organizer only)
//
// DEDUP RULE (Gan 2026-08-03, P0 fix): before inserting, check whether the player
// name already has an entry in this category (case-insensitive, matches player_1 OR
// player_2). Duplicate lines are SKIPPED and returned in the `duplicates` array so
// the organizer sees exactly what was ignored. Never create duplicate entries, and
// never create a second ghost profile for a name variant of an existing entry.
export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only organizers can import entries
  if (payload.role !== 'organizer') {
    return NextResponse.json({ error: "Only organizers can import entries" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { category_id, csv_text } = body;
    if (!category_id || !csv_text) {
      return NextResponse.json({ error: "category_id and csv_text are required" }, { status: 400 });
    }

    // Verify ownership (also fetch tournament_id for the dedup scope)
    const catCheck = await query(
      `SELECT c.id, c.type, c.tournament_id FROM categories c
       JOIN tournaments t ON t.id = c.tournament_id
       WHERE c.id = $1 AND t.organizer_id = $2`,
      [category_id, payload.userId]
    );
    if (catCheck.rows.length === 0) {
      return NextResponse.json({ error: "Category not found or not yours" }, { status: 403 });
    }

    const isDoubles = catCheck.rows[0].type === "doubles";
    const lines = csv_text.split("\n").map((l: string) => l.trim()).filter(Boolean);
    // Skip CSV header row
    const headers = ['name', 'Name', 'NAME', 'player', 'Player', 'PLAYER'];
    while (lines.length > 0 && headers.includes(lines[0])) {
      lines.shift();
    }

    let inserted = 0;
    let errors = 0;
    const duplicates: string[] = [];

    for (const line of lines) {
      try {
        if (isDoubles && line.includes(" / ")) {
          const parts = line.split(" / ").map((s: string) => s.trim());
          if (parts.length < 2) { errors++; continue; }
          // Dedup: skip if EITHER partner already has an entry in this category
          const dup1 = await hasEntryForName(category_id, parts[0]);
          const dup2 = await hasEntryForName(category_id, parts[1]);
          if (dup1 || dup2) {
            duplicates.push(line);
            continue;
          }
          const p1Id = await findOrCreateProfile(parts[0]);
          const p2Id = await findOrCreateProfile(parts[1]);
          await query(
            `INSERT INTO entries (category_id, player_1_id, player_2_id) VALUES ($1, $2, $3)`,
            [category_id, p1Id, p2Id]
          );
        } else {
          // Dedup: skip if this name already has an entry in this category
          if (await hasEntryForName(category_id, line)) {
            duplicates.push(line);
            continue;
          }
          const pid = await findOrCreateProfile(line);
          await query(
            `INSERT INTO entries (category_id, player_1_id) VALUES ($1, $2)`,
            [category_id, pid]
          );
        }
        inserted++;
      } catch (e) {
        console.error("Import line error:", line, e);
        errors++;
      }
    }

    return NextResponse.json({ count: inserted, errors, duplicates }, { status: 201 });
  } catch (err: any) {
    console.error("Import entries error:", err);
    return NextResponse.json({ error: "Failed to import entries" }, { status: 500 });
  }
}

// True if `name` already has an entry in this category (player_1 or player_2, case-insensitive).
// Dedup scope = category_id, which uniquely maps to (tournament_id, category_id).
async function hasEntryForName(categoryId: string, name: string): Promise<boolean> {
  const row = await queryOne(
    `SELECT 1 FROM entries e
     JOIN profiles p ON p.id = e.player_1_id OR p.id = e.player_2_id
     WHERE e.category_id = $1 AND LOWER(p.full_name) = LOWER($2)
     LIMIT 1`,
    [categoryId, name.trim()]
  );
  return !!row;
}

async function findOrCreateProfile(fullName: string): Promise<string> {
  const name = fullName.trim();
  if (!name) throw new Error("Empty name");

  // Exact match first
  const existing = await queryOne("SELECT id FROM profiles WHERE full_name = $1", [name]);
  if (existing) return existing.id;

  // Case-insensitive fallback
  const ci = await queryOne("SELECT id FROM profiles WHERE LOWER(full_name) = LOWER($1)", [name]);
  if (ci) return ci.id;

  // Create new
  const email = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@tuah.local`;
  const result = await query(
    `INSERT INTO profiles (email, full_name, role) VALUES ($1, $2, 'player') RETURNING id`,
    [email, name]
  );
  return result.rows[0].id;
}
