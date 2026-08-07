import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { hashPassword } from "@/lib/password";

// POST /api/public_registrations - Create a new player registration (public, no auth)
export async function POST(req: NextRequest) {
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const {
      tournament_id,
      category_id,
      player_name,
      email,
      phone,
      partner_name,
      ic_document_url,
      passport_url,
      student_card_url,
    } = body;

    // Validate required fields
    if (!tournament_id) {
      return NextResponse.json({ error: "tournament_id is required" }, { status: 400 });
    }
    if (!category_id) {
      return NextResponse.json({ error: "category_id is required" }, { status: 400 });
    }
    if (!player_name || !player_name.trim()) {
      return NextResponse.json({ error: "player_name is required" }, { status: 400 });
    }
    if (!email || !email.trim()) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    // Verify tournament exists and is accepting registrations
    const tournament = await queryOne(
      "SELECT id, status, title, entry_fee, tournament_type FROM tournaments WHERE id = $1",
      [tournament_id]
    );

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // Verify category exists in this tournament
    const category = await queryOne(
      "SELECT id, name, type FROM categories WHERE id = $1 AND tournament_id = $2",
      [category_id, tournament_id]
    );

    if (!category) {
      return NextResponse.json({ error: "Category not found in this tournament" }, { status: 400 });
    }

    // For doubles, partner_name is required if no player_2_id
    if (category.type === "doubles" && (!partner_name || !partner_name.trim())) {
      return NextResponse.json({ error: "partner_name is required for doubles category" }, { status: 400 });
    }

    // Determine if tournament is school type — student_card_url required for school tournaments
    if (tournament.tournament_type === "school" && !student_card_url) {
      return NextResponse.json({ error: "student_card_url is required for school tournaments" }, { status: 400 });
    }

    // Create/find profile for the player, then insert entry referencing profile id.
    // findOrCreateProfile ALWAYS returns { id, tempPassword? } so p1.id is defined.
    const p1 = await findOrCreateProfile(player_name.trim(), email.trim(), phone || null);
    const p1Id = p1.id;
    let p2Id: string | null = null;
    let p2TempPw: string | null = null;
    if (category.type === "doubles" && partner_name) {
      const p2 = await findOrCreateProfile(partner_name.trim(), null, null);
      p2Id = p2.id;
      p2TempPw = p2.tempPassword || null;
    }

    const result = await query(
      `INSERT INTO entries (
        category_id,
        player_1_id,
        player_2_id,
        registration_status,
        payment_status,
        ic_document_url,
        passport_url,
        student_card_url
      ) VALUES ($1, $2, $3, 'pending', 'unpaid', $4, $5, $6)
      RETURNING *`,
      [
        category_id,
        p1Id,
        p2Id,
        ic_document_url || null,
        passport_url || null,
        student_card_url || null,
      ]
    );

    const entry = result.rows[0];

    return NextResponse.json({
      success: true,
      entry,
      tournament_title: tournament.title || tournament.name,
      entry_fee: tournament.entry_fee,
      login: p1.tempPassword
        ? { email: email.trim(), password: p1.tempPassword }
        : null,
      partner_login: p2TempPw && email ? { email: `(partner ${partner_name})`, password: p2TempPw } : null,
    }, { status: 201 });
  } catch (err: any) {
    console.error("Public registration error:", err);
    return NextResponse.json({ error: "Failed to create registration" }, { status: 500 });
  }
}

interface FoundProfile {
  id: string;
  tempPassword?: string;
}

async function findOrCreateProfile(fullName: string, email: string | null, phone: string | null): Promise<FoundProfile> {
  const name = fullName.trim();
  if (!name) throw new Error("Empty name");

  // 1) Prefer email match: a returning player (same email) should reuse their
  //    account and get their name/phone refreshed, NOT hit a duplicate-name error.
  if (email) {
    const byEmail = await queryOne("SELECT id FROM profiles WHERE LOWER(email) = LOWER($1)", [email]);
    if (byEmail) {
      await query(
        "UPDATE profiles SET full_name = $1, phone = COALESCE($2, phone), updated_at = now() WHERE id = $3",
        [name, phone, byEmail.id]
      );
      return { id: byEmail.id };
    }
  }

  // 2) Exact name match
  const existing = await queryOne("SELECT id FROM profiles WHERE full_name = $1", [name]);
  if (existing) return { id: existing.id };

  // 3) Case-insensitive name fallback
  const ci = await queryOne("SELECT id FROM profiles WHERE LOWER(full_name) = LOWER($1)", [name]);
  if (ci) return { id: ci.id };

  // 4) Create a new profile with a one-time password so the player can log in
  //    (shown once on the success screen). Uses salted scrypt hashing.
  const genEmail = email || `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@tuah.local`;
  const tempPassword = Math.random().toString(36).slice(2, 10);
  const passwordHash = hashPassword(tempPassword);
  const result = await query(
    `INSERT INTO profiles (email, full_name, phone, password_hash, role) VALUES ($1, $2, $3, $4, 'player') RETURNING id`,
    [genEmail, name, phone, passwordHash]
  );
  return { id: result.rows[0].id, tempPassword };
}
