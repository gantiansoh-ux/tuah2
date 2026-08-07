import { Pool } from "pg";

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

export async function queryOne(text: string, params?: any[]) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

export async function queryAll(text: string, params?: any[]) {
  const result = await query(text, params);
  return result.rows;
}
