/**
 * Supabase Session pooler (IPv4 host *.pooler.supabase.com:5432) enforces a low
 * MaxClientsInSessionMode. Control Plane startup migrations open a dedicated pg
 * Client; combined with API pool, runner, LiteLLM, and deploy overlap, connect()
 * often fails with XX000. Prefer direct Postgres (db.<project-ref>.supabase.co)
 * for DDL — same password, separate connection budget.
 */

export function resolveMigrationConnectionString(
  databaseUrl: string | undefined,
  explicitMigrateUrl: string | undefined,
): string {
  const explicit = explicitMigrateUrl?.trim();
  if (explicit) return explicit;

  const primary = databaseUrl?.trim();
  if (!primary) throw new Error("DATABASE_URL is not set");

  const direct = trySupabaseDirectFromPooler(primary);
  if (direct) {
    console.log(
      "[migrations] Using direct Supabase host db.*.supabase.co for DDL (avoids Session pooler MaxClientsInSessionMode).",
    );
    return direct;
  }

  const txn = trySupabaseTransactionPoolerUrl(primary);
  if (txn) {
    console.log(
      "[migrations] Using Supabase transaction pooler :6543 for DDL (higher client limit than Session :5432).",
    );
    return txn;
  }

  return primary;
}

function trySupabaseDirectFromPooler(urlStr: string): string | null {
  if (!urlStr.includes("pooler.supabase.com")) return null;
  try {
    const normalized = urlStr.replace(/^postgres:\/\//i, "postgresql://");
    const u = new URL(normalized);
    const user = decodeURIComponent(u.username || "");
    const refMatch = user.match(/^postgres\.([a-zA-Z0-9]+)$/i);
    if (!refMatch) return null;
    const ref = refMatch[1];
    const pass =
      u.password !== undefined && u.password !== ""
        ? `:${decodeURIComponent(u.password)}`
        : "";
    const search = u.search || "";
    return `postgresql://postgres${pass}@db.${ref}.supabase.co:5432/postgres${search}`;
  } catch {
    return null;
  }
}

/** Session pooler is :5432; transaction mode is :6543 — more concurrent clients. */
function trySupabaseTransactionPoolerUrl(urlStr: string): string | null {
  if (!urlStr.includes("pooler.supabase.com")) return null;
  try {
    const normalized = urlStr.replace(/^postgres:\/\//i, "postgresql://");
    const u = new URL(normalized);
    const port = u.port || "5432";
    if (port !== "5432") return null;
    u.port = "6543";
    return u.toString();
  } catch {
    return null;
  }
}
