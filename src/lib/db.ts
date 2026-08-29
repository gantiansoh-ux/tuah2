import { Pool, PoolClient } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.PGHOST || "127.0.0.1",
      port: parseInt(process.env.PGPORT || "5432"),
      user: process.env.PGUSER || "tuah_user",
      password: process.env.PGPASSWORD || "tuah_pass_2026",
      database: process.env.PGDATABASE || "tuah",
      max: 20,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

export async function query(text: string, params?: any[]) {
  const client = await getPool().connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

// ============================================================
// Transactional helper (P1-1 arch wave)
// ------------------------------------------------------------------
// Runs `fn(client)` inside a SINGLE DB transaction. If `fn` throws, the
// whole transaction is rolled back and the error is rethrown. Every
// registration-state mutation (register / approve / reject / withdraw /
// disqualified / seed / import batch) goes through ONE transaction and ONE
// authoritative write to `entries` — no second-table mirror, no silently
// swallowed write (HARD GUARD).
//
//   const res = await withTransaction(async (client) => {
//     await client.query(`UPDATE entries SET status='withdrawn' WHERE id=$1`, [id]);
//     return { ok: true };
//   });
// ============================================================
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // connection may be broken; nothing more to do
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function queryOne(text: string, params?: any[]) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

export async function queryAll(text: string, params?: any[]) {
  const result = await query(text, params);
  return result.rows;
}
