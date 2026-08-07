import crypto from "crypto";

// ─── Password hashing: scrypt (salted) with legacy SHA-256 support ───
// New hashes are stored as:  scrypt$<salt-hex>$<hash-hex>
// Legacy unsalted SHA-256 hashes are verified transparently and
// automatically upgraded to scrypt on next successful login.

const SCRYPT_PREFIX = "scrypt$";
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, KEYLEN, { N, r: R, p: P }).toString("hex");
  return `${SCRYPT_PREFIX}${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;

  if (stored.startsWith(SCRYPT_PREFIX)) {
    const parts = stored.slice(SCRYPT_PREFIX.length).split("$");
    if (parts.length !== 2) return false;
    const [salt, hash] = parts;
    try {
      const derived = crypto.scryptSync(password, salt, KEYLEN, { N, r: R, p: P }).toString("hex");
      const a = Buffer.from(hash, "hex");
      const b = Buffer.from(derived, "hex");
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  // Legacy: unsalted SHA-256 (hex)
  const legacy = crypto.createHash("sha256").update(password).digest("hex");
  return legacy === stored;
}

export function isLegacyHash(stored: string): boolean {
  return !!stored && !stored.startsWith(SCRYPT_PREFIX);
}
