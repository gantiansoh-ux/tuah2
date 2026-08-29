import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne, withTransaction } from "@/lib/db";
import { checkCategoryCapacity, acquireRegLock } from "@/lib/registration";

// POST /api/entries/import - bulk import entries from CSV text (organizer only)
//
// DEDUP RULE (Gan 2026-08-03, P0 fix): before inserting, check whether the player
// name already has an entry in this category (case-insensitive, matches player_1 OR
// player_2). Duplicate lines are SKIPPED and returned in the `duplicates` array.
//
// P1-1 arch (Decision #4): re-import of a WITHDRAWN participant is SKIPPED BY
// DEFAULT — a withdrawn entry's name already "has an entry", so the line falls into
// `duplicates`. We NEVER auto-resurrect a withdrawn participant; resurrection is an
// explicit organizer action only (a separate future admin flow).
//
// P1-1 arch (transaction boundary): the WHOLE batch is inserted in ONE transaction
// (atomic). A failure in any line aborts the entire batch — no partial import.
//
// CAPACITY GATE (BUG-012): bulk import must not bypass max_entries (dedup-aware
// preflight preserved). Over-capacity batches are rejected atomically with 409.
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

    // BUG-012 close-out: category already full (approved+pending >= max_entries) -> 409
    const cap = await checkCategoryCapacity(category_id, {
      tournamentId: catCheck.rows[0].tournament_id,
    });
    if (!cap.allowed) {
      return NextResponse.json(
        { error: cap.error, count: 0, errors: 0, duplicates: [] },
        { status: cap.status ?? 409 }
      );
    }

    const isDoubles = catCheck.rows[0].type === "doubles";
    const lines = csv_text.split("\n").map((l: string) => l.trim()).filter(Boolean);
    // Skip CSV header row
    const headers = ['name', 'Name', 'NAME', 'player', 'Player', 'PLAYER'];
    while (lines.length > 0 && headers.includes(lines[0])) {
      lines.shift();
    }

    // Dedup-aware preflight: would this batch exceed capacity once inserted?
    // Replicates the loop's dedup semantics (in-batch duplicates counted once,
    // parse-invalid doubles lines excluded) so the count is exact. Withdrawn
    // entries count as "already has an entry" (Decision #4 -> never resurrect).
    const maxRow = await queryOne("SELECT max_entries FROM categories WHERE id = $1", [category_id]);
    const maxEntries = maxRow?.max_entries == null ? 0 : Number(maxRow.max_entries);
    if (maxEntries > 0) {
      const existing = await queryOne(
        `SELECT COUNT(*)::int AS n FROM entries
         WHERE category_id = $1 AND registration_status IN ('approved', 'pending')`,
        [category_id]
      );
      const existingN = Number(existing?.n ?? 0);
      const seen = new Set<string>();
      let willInsert = 0;
      for (const line of lines) {
        try {
          if (isDoubles && line.includes(" / ")) {
            const parts = line.split(" / ").map((s: string) => s.trim());
            if (parts.length < 2) continue; // would land in errors, not inserted
            if (seen.has(parts[0]) || seen.has(parts[1])) continue;
            if (await hasEntryForName(category_id, parts[0], true)) continue;
            if (await hasEntryForName(category_id, parts[1], true)) continue;
            seen.add(parts[0]);
            seen.add(parts[1]);
          } else {
            if (seen.has(line)) continue;
            if (await hasEntryForName(category_id, line, true)) continue;
            seen.add(line);
          }
          willInsert++;
        } catch {
          continue; // line would error in the insert loop; not counted
        }
      }
      if (existingN + willInsert > maxEntries) {
        return NextResponse.json(
          {
            error: "This category is full (max entries reached)",
            count: 0,
            errors: 0,
            duplicates: [],
            capacity: { max: maxEntries, existing: existingN, requested: willInsert },
          },
          { status: 409 }
        );
      }
    }

    let inserted = 0;
    let errors = 0;
    const duplicates: string[] = [];

    // P1-1 arch: run the whole batch inside ONE transaction (atomic).
    const outcome = await withTransaction(async (client) => {
      // UNIQUE-GATE: per-category transaction advisory lock FIRST (TOCTOU fix).
      await acquireRegLock(client, category_id);
      for (const line of lines) {
        try {
          if (isDoubles && line.includes(" / ")) {
            const parts = line.split(" / ").map((s: string) => s.trim());
            if (parts.length < 2) { errors++; continue; }
            // Dedup: skip if EITHER partner already has an entry (incl. withdrawn ->
            // Decision #4: never resurrect). Queries must run on the txn client.
            const dup1 = await hasEntryForNameTx(client, category_id, parts[0]);
            const dup2 = await hasEntryForNameTx(client, category_id, parts[1]);
            if (dup1 || dup2) {
              duplicates.push(line);
              continue;
            }
            const p1Id = await findOrCreateProfileTx(client, parts[0]);
            const p2Id = await findOrCreateProfileTx(client, parts[1]);
            await client.query(
              `INSERT INTO entries (category_id, player_1_id, player_2_id) VALUES ($1, $2, $3)`,
              [category_id, p1Id, p2Id]
            );
          } else {
            // Dedup: skip if this name already has an entry (incl. withdrawn).
            if (await hasEntryForNameTx(client, category_id, line)) {
              duplicates.push(line);
              continue;
            }
            const pid = await findOrCreateProfileTx(client, line);
            await client.query(
              `INSERT INTO entries (category_id, player_1_id) VALUES ($1, $2)`,
              [category_id, pid]
            );
          }
          inserted++;
        } catch (e) {
          console.error("Import line error:", line, e);
          errors++;
          // Throw to abort the WHOLE batch (atomic) on a hard DB error.
          if ((e as any)?.code && (e as any).code.startsWith("23")) {
            throw e;
          }
        }
      }
    });

    return NextResponse.json({ count: inserted, errors, duplicates }, { status: 201 });
  } catch (err: any) {
    // A thrown constraint/permission error means the batch rolled back atomically.
    if (err && typeof err.code === "string" && err.code.startsWith("23")) {
      console.error("Import batch atomic-abort (constraint):", err);
      return NextResponse.json(
        { error: "Import failed: a database constraint was violated. No rows inserted (atomic).", count: 0, errors: 1, duplicates: [] },
        { status: 409 }
      );
    }
    console.error("Import entries error:", err);
    return NextResponse.json({ error: "Failed to import entries" }, { status: 500 });
  }
}

// True if `name` already has an entry in this category (player_1 or player_2,
// case-insensitive). includesWithdrawn=true means a WITHDRAWN entry still blocks
// re-import (Decision #4: never auto-resurrect). Default path treats ALL statuses
// as "already registered".
async function hasEntryForName(
  categoryId: string,
  name: string,
  includesWithdrawn = true
): Promise<boolean> {
  return hasEntryForNameInternal(categoryId, name, undefined);
}

async function hasEntryForNameTx(
  client: any,
  categoryId: string,
  name: string
): Promise<boolean> {
  return hasEntryForNameInternal(categoryId, name, client);
}

async function hasEntryForNameInternal(
  categoryId: string,
  name: string,
  client?: any
): Promise<boolean> {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    `SELECT 1 FROM entries e
     JOIN profiles p ON p.id = e.player_1_id OR p.id = e.player_2_id
     WHERE e.category_id = $1 AND LOWER(p.full_name) = LOWER($2)
     LIMIT 1`,
    [categoryId, name.trim()]
  );
  return (res.rows?.length ?? 0) > 0;
}

async function findOrCreateProfileTx(client: any, fullName: string): Promise<string> {
  const q = client ? client.query.bind(client) : query;
  const name = fullName.trim();
  if (!name) throw new Error("Empty name");

  const existing = await q("SELECT id FROM profiles WHERE full_name = $1", [name]);
  if (existing.rows.length > 0) return existing.rows[0].id;

  const ci = await q("SELECT id FROM profiles WHERE LOWER(full_name) = LOWER($1)", [name]);
  if (ci.rows.length > 0) return ci.rows[0].id;

  const email = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@tuah.local`;
  const r = await q(
    `INSERT INTO profiles (email, full_name, role) VALUES ($1, $2, 'player') RETURNING id`,
    [email, name]
  );
  return r.rows[0].id;
}
