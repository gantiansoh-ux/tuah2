import { query, queryOne } from "@/lib/db";
import { hashPassword } from "@/lib/password";

// ============================================================
// Shared profile lookup-or-create helper (P1-1 arch wave)
// ------------------------------------------------------------------
// Previously duplicated inline in entries/create, public_registrations and
// entries/import. Centralized so registration/doubles/import paths behave the
// same way (the doubles (A,B)/(B,A) and active-dup guards rely on stable
// profile ids).
// ============================================================

export interface FoundProfile {
  id: string;
  tempPassword?: string;
}

// Basic find-or-create by name (used by entries/create doubles partner and
// entries/import). Reuses profiles when the name matches (exact then
// case-insensitive), otherwise creates a disposable player profile.
export async function findOrCreateProfile(fullName: string): Promise<string> {
  const name = fullName.trim();
  if (!name) throw new Error("Empty name");

  const existing = await queryOne("SELECT id FROM profiles WHERE full_name = $1", [name]);
  if (existing) return existing.id;

  const ci = await queryOne(
    "SELECT id FROM profiles WHERE LOWER(full_name) = LOWER($1)",
    [name]
  );
  if (ci) return ci.id;

  const email = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@tuah.local`;
  const result = await query(
    `INSERT INTO profiles (email, full_name, role) VALUES ($1, $2, 'player') RETURNING id`,
    [email, name]
  );
  return result.rows[0].id;
}

// Full find-or-create with email/phone + one-time temp password (used by
// public_registrations, which is unauthenticated).
export async function findOrCreateProfileFull(
  fullName: string,
  email: string | null,
  phone: string | null
): Promise<FoundProfile> {
  const name = fullName.trim();
  if (!name) throw new Error("Empty name");

  if (email) {
    const byEmail = await queryOne(
      "SELECT id FROM profiles WHERE LOWER(email) = LOWER($1)",
      [email]
    );
    if (byEmail) {
      await query(
        "UPDATE profiles SET full_name = $1, phone = COALESCE($2, phone), updated_at = now() WHERE id = $3",
        [name, phone, byEmail.id]
      );
      return { id: byEmail.id };
    }
  }

  const existing = await queryOne("SELECT id FROM profiles WHERE full_name = $1", [name]);
  if (existing) return { id: existing.id };

  const ci = await queryOne(
    "SELECT id FROM profiles WHERE LOWER(full_name) = LOWER($1)",
    [name]
  );
  if (ci) return { id: ci.id };

  const genEmail = email || `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@tuah.local`;
  const tempPassword = Math.random().toString(36).slice(2, 10);
  const passwordHash = hashPassword(tempPassword);
  const result = await query(
    `INSERT INTO profiles (email, full_name, phone, password_hash, role) VALUES ($1, $2, $3, $4, 'player') RETURNING id`,
    [genEmail, name, phone, passwordHash]
  );
  return { id: result.rows[0].id, tempPassword };
}
