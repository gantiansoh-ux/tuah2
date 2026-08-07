// Supabase is no longer used. This file is kept as a stub.
// All API calls now go through fetch() to self-hosted API routes.
// See src/lib/db.ts for the PostgreSQL pool.
// See src/lib/auth.ts for JWT authentication.
export function createClient() {
  throw new Error("Supabase is no longer supported. Use fetch() to API routes instead.");
}
