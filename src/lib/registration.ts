import { queryOne } from "@/lib/db";

// ============================================================
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

  // ③ capacity gate: approved + pending entries < max_entries (only when max_entries > 0)
  if (categoryId) {
    const cat = await queryOne(
      `SELECT id, max_entries FROM categories WHERE id = $1 AND tournament_id = $2`,
      [categoryId, tournamentId]
    );
    if (!cat) {
      return { allowed: false, status: 400, error: "Category not found in this tournament" };
    }
    const maxEntries = cat.max_entries == null ? 0 : Number(cat.max_entries);
    if (maxEntries > 0) {
      const cnt = await queryOne(
        `SELECT COUNT(*)::int AS n FROM entries
         WHERE category_id = $1 AND registration_status IN ('approved', 'pending')`,
        [categoryId]
      );
      if (Number(cnt.n) >= maxEntries) {
        return {
          allowed: false,
          status: 409,
          error: "This category is full (max entries reached)",
        };
      }
    }
  }

  return { allowed: true };
}
