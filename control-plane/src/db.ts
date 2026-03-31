import pg from "pg";

/**
 * Supabase Session pooler (pooler.supabase.com:5432) shares a small server-side cap across
 * every client (Control Plane, Runner, ad-hoc tools). Defaulting max=10 here + runner's pool
 * exceeds that cap → MaxClientsInSessionMode. Match runner defaults when this URL is used.
 */
function isSupabaseSessionPooler5432(connectionString: string | undefined): boolean {
  if (!connectionString?.trim()) return false;
  try {
    const u = new URL(connectionString);
    return u.hostname.includes("pooler.supabase.com") && (u.port === "" || u.port === "5432");
  } catch {
    return false;
  }
}

const sessionPooler = isSupabaseSessionPooler5432(process.env.DATABASE_URL);
const poolMaxEnv = process.env.DATABASE_POOL_MAX?.trim();
/** Direct Postgres / transaction pooler: allow more; session pooler: stay tiny. */
const defaultPoolMax = sessionPooler ? 2 : 10;
let poolSize: number;
if (poolMaxEnv) {
  const n = Number(poolMaxEnv);
  poolSize = Number.isFinite(n) && n >= 1 ? Math.min(50, Math.floor(n)) : defaultPoolMax;
} else {
  poolSize = defaultPoolMax;
}
poolSize = Math.max(1, poolSize);

if (sessionPooler && !poolMaxEnv) {
  console.warn(
    "[control-plane] Supabase Session pooler shares a low connection cap with the runner and other services. Defaulting DATABASE_POOL_MAX=2. For higher concurrency use the direct host db.<project>.supabase.co:5432, or Supabase transaction pooler :6543, or set DATABASE_POOL_MAX after raising pooler limits.",
  );
} else if (sessionPooler && poolSize > 4) {
  console.warn(
    `[control-plane] DATABASE_POOL_MAX=${poolSize} with Supabase Session pooler may hit MaxClientsInSessionMode alongside the runner; consider ≤4 or a direct / transaction pooler URL.`,
  );
}

const connectionTimeoutMs = Math.max(
  5_000,
  Math.min(120_000, Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS) || 20_000),
);
const sessionConnectTimeout = Math.max(connectionTimeoutMs, 90_000);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: poolSize,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: sessionPooler ? sessionConnectTimeout : connectionTimeoutMs,
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
