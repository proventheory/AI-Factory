import pg from "pg";
declare const pool: import("pg").Pool;
export type DbClient = pg.Pool | pg.PoolClient;
export declare function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T>;
export { pool };
//# sourceMappingURL=db.d.ts.map