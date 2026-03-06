import pg from "pg";
const poolSize = Math.max(1, Math.min(50, Number(process.env.DATABASE_POOL_MAX) || 5));
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: poolSize,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
});
export async function withTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    }
    catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        throw err;
    }
    finally {
        client.release();
    }
}
export { pool };
//# sourceMappingURL=db.js.map