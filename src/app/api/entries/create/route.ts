import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { queryOne, withTransaction } from "@/lib/db";
import { checkRegistrationAllowed, acquireRegLockAndGuard, RegistrationConflictError } from "@/lib/registration";
import { findOrCreateProfile } from "@/lib/profiles";

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

    // Registration gate: tournament status, window, category capacity (BUG-010-reg)
    const gate = await checkRegistrationAllowed(catCheck.tournament_id, category_id);
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
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

    // UNIQUE-GATE: ACTIVE cross-position duplicate guard (category + p1 U p2)
    // now runs INSIDE the transaction, right after the per-category advisory
    // lock, so the guard's read + this INSERT are atomic (TOCTOU closed) and
    // overlaps (singles<->doubles, A-in-p1 vs A-in-p2) are caught. On dup, the
    // guard throws -> mapped to 409. DB unique indexes additionally clamp
    // same-key singles / doubles-symmetry duplicates.
    const result = await withTransaction(async (client) => {
      await acquireRegLockAndGuard(client, category_id, entryPlayerId, player2Id);
      const r = await client.query(
        `INSERT INTO entries (category_id, player_1_id, player_2_id, registration_status, confirmed_at)
         VALUES ($1, $2, $3, 'pending', NULL) RETURNING *`,
        [category_id, entryPlayerId, player2Id]
      );
      return r.rows[0];
    }).catch((err: any) => {
      if (err instanceof RegistrationConflictError) {
        return { __conflict: true };
      }
      throw err;
    });

    if ((result as any)?.__conflict) {
      return NextResponse.json({ error: "You are already registered for this category" }, { status: 409 });
    }

    return NextResponse.json({ entry: result }, { status: 201 });
  } catch (err: any) {
    console.error("Create entry error:", err);
    return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
  }
}
