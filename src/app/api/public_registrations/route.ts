import { NextRequest, NextResponse } from "next/server";
import { queryOne, withTransaction } from "@/lib/db";
import { checkRegistrationAllowed, acquireRegLockAndGuard, RegistrationConflictError } from "@/lib/registration";
import { findOrCreateProfileFull } from "@/lib/profiles";

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

    // Registration gate: tournament status, window, category capacity (BUG-010-reg)
    const gate = await checkRegistrationAllowed(tournament_id, category_id);
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    // For doubles, partner_name is required if no player_2_id
    if (category.type === "doubles" && (!partner_name || !partner_name.trim())) {
      return NextResponse.json({ error: "partner_name is required for doubles category" }, { status: 400 });
    }

    // Determine if tournament is school type — student_card_url required for school tournaments
    if (tournament.tournament_type === "school" && !student_card_url) {
      return NextResponse.json({ error: "student_card_url is required for school tournaments" }, { status: 400 });
    }

    // P1-1 arch: create/find profiles, then guard for ACTIVE duplicates
    // (category + player(+pair), pending/approved + registered/confirmed; doubles
    // (A,B)/(B,A) normalized). Public double-submit -> 409.
    const p1 = await findOrCreateProfileFull(player_name.trim(), email.trim(), phone || null);
    const p1Id = p1.id;
    let p2Id: string | null = null;
    let p2TempPw: string | null = null;
    if (category.type === "doubles" && partner_name) {
      const p2 = await findOrCreateProfileFull(partner_name.trim(), null, null);
      p2Id = p2.id;
      p2TempPw = p2.tempPassword || null;
    }

    // UNIQUE-GATE: ACTIVE cross-position duplicate guard runs INSIDE the
    // transaction, right after the per-category advisory lock (TOCTOU closed),
    // so public double-submit and player overlaps are caught atomically. DB
    // unique indexes additionally clamp same-key singles / doubles-symmetry.
    const entry = await withTransaction(async (client) => {
      await acquireRegLockAndGuard(client, category_id, p1Id, p2Id);
      const r = await client.query(
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
      return r.rows[0];
    }).catch((err: any) => {
      if (err instanceof RegistrationConflictError) {
        return { __conflict: true };
      }
      throw err;
    });

    if ((entry as any)?.__conflict) {
      return NextResponse.json({ error: "You are already registered for this category" }, { status: 409 });
    }

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
