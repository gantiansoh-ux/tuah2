import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { queryOne, withTransaction } from "@/lib/db";
import { checkRegistrationAllowed, acquireRegLockAndGuard, RegistrationConflictError } from "@/lib/registration";
import { findOrCreateProfile } from "@/lib/profiles";

// ============================================================
// POST /api/tournaments/[id]/register  — THE single registration entry point
// ------------------------------------------------------------------
// (Decision #1: unified register endpoint.) ALL UI registration paths
// (player dashboard handleJoin, tournament/audience page Register) call THIS
// endpoint. It is a thin, authoritative wrapper over the same logic as
// entries/create: gate + ACTIVE duplicate guard (incl. doubles (A,B)/(B,A)
// symmetry) + ONE transactional insert into `entries`.
//
// HARD GUARD: registration is ONE transaction, ONE authoritative write to
// `entries`, ONE success/failure result. There is NO second-table mirror.
// ============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournament_id } = await params;

  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await verifyToken(cookie);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { category_id, partner_name } = body;

    if (!category_id) {
      return NextResponse.json({ error: "category_id is required" }, { status: 400 });
    }

    // Verify the category belongs to this tournament.
    const catCheck = await queryOne(
      `SELECT c.id, c.type, c.tournament_id
       FROM categories c
       WHERE c.id = $1 AND c.tournament_id = $2`,
      [category_id, tournament_id]
    );
    if (!catCheck) {
      return NextResponse.json(
        { error: "Category not found in this tournament" },
        { status: 404 }
      );
    }

    // Registration gate: tournament status, window, category capacity.
    const gate = await checkRegistrationAllowed(tournament_id, category_id);
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    // Self-registration only: security still holds at the unified entry point.
    const entryPlayerId = payload.userId;

    const isDoubles = catCheck.type === "doubles";
    let player2Id: string | null = null;
    if (isDoubles) {
      if (!partner_name || !String(partner_name).trim()) {
        return NextResponse.json(
          { error: "Partner name is required for doubles" },
          { status: 400 }
        );
      }
      player2Id = await findOrCreateProfile(String(partner_name).trim());
    }

    // ONE transactional insert into entries. UNIQUE-GATE: the expanded
    // cross-position duplicate guard runs INSIDE the transaction, right after
    // the per-category advisory lock, so the guard's read + this INSERT are
    // atomic (TOCTOU closed). A cross-position/active duplicate throws
    // RegistrationConflictError -> mapped to 409 below. Not a substitute for
    // the DB unique indexes (singles / doubles-symmetry), which still clamp
    // same-key duplicates at the DB level.
    const entry = await withTransaction(async (client) => {
      await acquireRegLockAndGuard(client, category_id, entryPlayerId, player2Id);
      const res = await client.query(
        `INSERT INTO entries (category_id, player_1_id, player_2_id, registration_status, confirmed_at)
         VALUES ($1, $2, $3, 'pending', NULL)
         RETURNING *`,
        [category_id, entryPlayerId, player2Id]
      );
      return res.rows[0];
    }).catch((err: any) => {
      if (err instanceof RegistrationConflictError) {
        return { __conflict: true };
      }
      throw err;
    });

    if (entry && (entry as any).__conflict) {
      return NextResponse.json(
        { error: "You are already registered for this category" },
        { status: 409 }
      );
    }

    return NextResponse.json({ entry, tournament_id }, { status: 201 });
  } catch (err: any) {
    // BUG-012 / HARD GUARD: any internal error must surface as non-2xx, not a
    // silently swallowed side effect.
    console.error("Register via unified endpoint error:", err);
    return NextResponse.json({ error: "Failed to register" }, { status: 500 });
  }
}
