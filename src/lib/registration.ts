import { queryOne } from "@/lib/db";
// Shared server-side registration gate (BUG-010-reg, 2026-08-08)
// Used by ALL player registration paths:
//   - POST /api/entries/create
//   - POST /api/public_registrations
//   - POST /api/tournament_registrations
//
// Rejects when:
//   ① tournament status does not accept registrations (draft / completed)
//   ② now is outside [registration_open, registration_deadline]
//      (unset bounds are ignored for backward compatibility)
//   ③ the category has reached max_entries (approved + pending count)
//
// BUG-012 (2026-08-08): checkCategoryCapacity() also gates organizer
//   APPROVAL paths (PATCH tournament_registrations/[id],
//   PATCH entries/[id]) so capacity cannot be bypassed by approval.
// ============================================================

export interface RegistrationGateResult {
  allowed: boolean;
  status?: number;
  error?: string;
}

const CLOSED_STATUSES = ["draft", "completed"];

export async function checkRegistrationAllowed(
  tournamentId: string,
  categoryId?: string | null
): Promise<RegistrationGateResult> {
  const t = await queryOne(
    `SELECT id, status, registration_open, registration_deadline FROM tournaments WHERE id = $1`,
    [tournamentId]
  );
  if (!t) {
    return { allowed: false, status: 404, error: "Tournament not found" };
  }

  // ① status gate: not draft / completed
  if (CLOSED_STATUSES.includes(t.status)) {
    return {
      allowed: false,
      status: 409,
      error: "Registration is not open for this tournament",
    };
  }

  // ② window gate: now must be within [registration_open, registration_deadline]
  const now = new Date();
  if (t.registration_open && now < new Date(t.registration_open)) {
    return { allowed: false, status: 409, error: "Registration has not opened yet" };
  }
  if (t.registration_deadline && now > new Date(t.registration_deadline)) {
    return { allowed: false, status: 409, error: "Registration has closed" };
  }

  // ③ capacity gate
  if (categoryId) {
    return checkCategoryCapacity(categoryId, { tournamentId });
  }

  return { allowed: true };
}

// Capacity gate shared by registration POST paths AND organizer approval
// PATCH paths (BUG-012). Counts approved + pending entries; when
// max_entries > 0 and count (minus the entry being approved, if any)
// already reaches max, the operation is rejected with 409.
export async function checkCategoryCapacity(
  categoryId: string,
  opts: { tournamentId?: string; excludeEntryId?: string } = {}
): Promise<RegistrationGateResult> {
  const catParams: any[] = [categoryId];
  let catWhere = `WHERE id = $1`;
  if (opts.tournamentId) {
    catParams.push(opts.tournamentId);
    catWhere += ` AND tournament_id = $${catParams.length}`;
  }
  const cat = await queryOne(`SELECT id, max_entries FROM categories ${catWhere}`, catParams);
  if (!cat) {
    return { allowed: false, status: 400, error: "Category not found" };
  }

  const maxEntries = cat.max_entries == null ? 0 : Number(cat.max_entries);
  if (maxEntries <= 0) {
    return { allowed: true };
  }

  const cntParams: any[] = [categoryId];
  let cntSql = `SELECT COUNT(*)::int AS n FROM entries
                WHERE category_id = $1 AND registration_status IN ('approved', 'pending')`;
  if (opts.excludeEntryId) {
    cntParams.push(opts.excludeEntryId);
    cntSql += ` AND id != $${cntParams.length}`;
  }
  const cnt = await queryOne(cntSql, cntParams);
  if (Number(cnt.n) >= maxEntries) {
    return {
      allowed: false,
      status: 409,
      error: "This category is full (max entries reached)",
    };
  }

  return { allowed: true };
}

// ============================================================
// ACTIVE duplicate guard (P1-1 arch wave + UNIQUE-GATE expansion)
// ------------------------------------------------------------------
// Shared by the unified register endpoint, entries/create and
// public_registrations. Enforces the cross-position rule that a DB index CANNOT:
//
//   A player may not appear in ANY active entry position (player_1_id OR
//   player_2_id) of the SAME category.
//
// This covers, in one membership scan:
//   - singles -> doubles   (a singles player can't also be in a doubles)
//   - doubles -> singles   (a doubles player can't also enter singles)
//   - player overlap between two doubles (A in one team, A in another)
//   - reversed doubles (A,B) vs (B,A)  (both members collide)
//
// LOCKED ACTIVE PREDICATE (unify everywhere: app guard AND DB partial indexes):
//   status              IN ('registered','confirmed')
//   registration_status IN ('pending','approved')
// status='withdrawn' / 'rejected' / 'disqualified' NEVER enters active
// uniqueness — those historical rows are never falsely blocked.
//
// Returns true when ANY of the candidate players already holds an ACTIVE entry
// position in the category, so callers can respond 409.
//
// NOTE (documented DB-index limit): a btree unique index cannot express the
// cross-column set constraint "the same player appearing in p1 and/or p2".
// That overlap is enforced HERE (app guard) + the transaction advisory lock.
// ============================================================
export async function activeDuplicateGuard(
  categoryId: string,
  player1Id: string,
  player2Id: string | null,
  client?: { query: (sql: string, params?: any[]) => Promise<any> }
): Promise<boolean> {
  const q = client ? client.query.bind(client) : queryOne;
  const ids = player2Id == null ? [player1Id] : [player1Id, player2Id];
  const resp = await q(
    `SELECT e.id FROM entries e
     WHERE e.category_id = $1
       AND (e.player_1_id = ANY($2::uuid[]) OR e.player_2_id = ANY($2::uuid[]))
       AND e.registration_status IN ('pending', 'approved')
       AND e.status IN ('registered', 'confirmed')
     LIMIT 1`,
    [categoryId, ids]
  );
  // queryOne returns the row (or null); client.query returns {rows:[...]}.
  const row = client ? (resp.rows && resp.rows[0]) : resp;
  return !!row;
}

// ============================================================
// Transaction advisory lock (UNIQUE-GATE, TOCTOU fix)
// ------------------------------------------------------------------
// Serializes concurrent registration writes PER CATEGORY so the expanded
// cross-position app guard's read+insert is atomic. Call as the FIRST
// statement inside every transaction that creates an entry:
//
//   const entry = await withTransaction(async (client) => {
//     await acquireRegLock(client, category_id);   // <-- first
//     // ... expanded activeDuplicateGuard read + INSERT ...
//   });
//
// Transaction-scoped: the lock is held until COMMIT/ROLLBACK and then
// auto-released. NOT a substitute for the unique indexes — it only closes
// the TOCTOU window between the guard's SELECT and the INSERT.
// ============================================================
export async function acquireRegLock(
  client: { query: (sql: string, params?: any[]) => Promise<any> },
  categoryId: string
): Promise<void> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [categoryId]);
}

// ============================================================
// UNIQUE-GATE: per-category serialized guard + insert helper
// ------------------------------------------------------------------
// Acquires the transaction advisory lock, then runs the EXPANDED
// cross-position activeDuplicateGuard INSIDE the same transaction (client),
// so the guard's read + the caller's INSERT are atomic (TOCTOU closed).
// On a duplicate/overlap it throws RegistrationConflictError, which the
// route maps to HTTP 409. NOT a substitute for the unique indexes.
// ============================================================
export class RegistrationConflictError extends Error {}

export async function acquireRegLockAndGuard(
  client: { query: (sql: string, params?: any[]) => Promise<any> },
  categoryId: string,
  player1Id: string,
  player2Id: string | null
): Promise<void> {
  await acquireRegLock(client, categoryId);
  const dup = await activeDuplicateGuard(categoryId, player1Id, player2Id, client);
  if (dup) {
    throw new RegistrationConflictError("You are already registered for this category");
  }
}
