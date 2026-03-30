import pg from "pg";

/**
 * Default 10: long-running control plane runs API + many interval jobs (reaper, self-heal, drift).
 * With max=3, parallel self-heal remediations + reaper loops often exhaust the pool and
 * `pool.connect()` hits connectionTimeoutMillis ("timeout exceeded when trying to connect").
 * Use DATABASE_POOL_MAX=3 (or lower) if your Postgres role / Supabase pooler enforces a low cap.
 */
const poolSize = Math.max(1, Math.min(50, Number(process.env.DATABASE_POOL_MAX) || 10));

const connectionTimeoutMs = Math.max(
  5_000,
  Math.min(120_000, Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS) || 20_000),
);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: poolSize,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: connectionTimeoutMs,
});

export type DbClient = pg.Pool | pg.PoolClient;

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export { pool };
