import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { checkRegistrationAllowed } from "@/lib/registration";

// GET /api/tournament_registrations?tournament_id=xxx
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const tournament_id = req.nextUrl.searchParams.get("tournament_id");
    if (!tournament_id) return NextResponse.json({ error: "tournament_id required" }, { status: 400 });

    // SEC-3A2-03: registration lists (with player emails) are private to the
    // tournament organizer (or an admin). Any other role gets 403.
    const tournament = await queryOne(
      "SELECT organizer_id FROM tournaments WHERE id = $1",
      [tournament_id]
    );
    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }
    if (payload.role !== "admin" && tournament.organizer_id !== payload.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await query(
      `SELECT r.*, p.full_name AS player_name, p.email AS player_email
       FROM tournament_registrations r
       LEFT JOIN profiles p ON r.profile_id = p.id
       WHERE r.tournament_id = $1
       ORDER BY r.registered_at DESC`,
      [tournament_id]
    );

    return NextResponse.json({ registrations: result.rows });
  } catch (err: any) {
    console.error("List registrations error:", err);
    return NextResponse.json({ error: "Failed to load registrations" }, { status: 500 });
  }
}

// POST /api/tournament_registrations
export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { tournament_id, category_id } = await req.json();
    if (!tournament_id) return NextResponse.json({ error: "tournament_id required" }, { status: 400 });

    // Registration gate: tournament existence, status, window, category capacity (BUG-010-reg)
    const gate = await checkRegistrationAllowed(tournament_id, category_id || null);
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    // Multi-category support (方案 B / Gan 2026-08-17): a player may register
    // in MULTIPLE categories of the same tournament (e.g. singles + doubles).
    // The duplicate check is therefore per (tournament, profile, category) —
    // NOT per tournament. When category_id is null (older flows), keep the
    // legacy per-tournament guard so we never dup-register the tournament.
    const existing = category_id
      ? await query(
          `SELECT id FROM tournament_registrations
           WHERE tournament_id = $1 AND profile_id = $2 AND category_id = $3
             AND status IN ('pending', 'approved')`,
          [tournament_id, payload.userId, category_id]
        )
      : await query(
          `SELECT id FROM tournament_registrations
           WHERE tournament_id = $1 AND profile_id = $2
             AND status IN ('pending', 'approved')`,
          [tournament_id, payload.userId]
        );
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "Already registered for this category" }, { status: 409 });
    }

    const result = await query(
      `INSERT INTO tournament_registrations (tournament_id, profile_id, category_id, status) VALUES ($1, $2, $3, 'pending') RETURNING *`,
      [tournament_id, payload.userId, category_id || null]
    );

    // TUA11 (2026-08-15): A Join-UI registration must immediately produce an
    // `entries` row so the player is not stranded in the separate
    // tournament_registrations silo (dual source of truth). Create the
    // pending entry here (mirroring the organizer approve path, which
    // de-dupes and only flips status on later approval). Payments (Phase 2)
    // and draws attach to `entries`, so this keeps payment/draw working
    // without waiting for organizer approval.
    if (category_id) {
      try {
        const dupEntry = await queryOne(
          `SELECT id FROM entries WHERE category_id = $1 AND player_1_id = $2 LIMIT 1`,
          [category_id, payload.userId]
        );
        if (dupEntry) {
          await query(
            `UPDATE entries SET registration_status = 'pending', confirmed_at = NULL WHERE id = $1`,
            [dupEntry.id]
          );
        } else {
          await query(
            `INSERT INTO entries (category_id, player_1_id, registration_status, confirmed_at)
             VALUES ($1, $2, 'pending', NULL)`,
            [category_id, payload.userId]
          );
        }
      } catch (entryErr: any) {
        // Registration already succeeded; do not fail the whole request if
        // the mirroring entry could not be created.
        console.error("Create mirror entry error:", entryErr);
      }
    }

    return NextResponse.json({ registration: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    console.error("Create registration error:", err);
    return NextResponse.json({ error: "Failed to register" }, { status: 500 });
  }
}
