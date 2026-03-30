/**
 * Session pooler (:5432) hits MaxClientsInSessionMode when many services connect.
 * Use transaction pooler (:6543) on the same Supabase pooler host for migrations —
 * higher limits and works on Render (direct db.*.supabase.co often resolves to IPv6
 * only → connect ENETUNREACH from Docker).
 *
 * Set DATABASE_URL_MIGRATE for a custom URL, or SUPABASE_MIGRATE_USE_DIRECT=true to
 * opt back into db.*.supabase.co derivation from the pooler URL.
 */

export function resolveMigrationConnectionString(
  databaseUrl: string | undefined,
  explicitMigrateUrl: string | undefined,
): string {
  const explicit = explicitMigrateUrl?.trim();
  if (explicit) return explicit;

  const primary = databaseUrl?.trim();
  if (!primary) throw new Error("DATABASE_URL is not set");

  const txn = trySupabaseTransactionPoolerUrl(primary);
  if (txn) {
    console.log(
      "[migrations] Using Supabase transaction pooler :6543 for DDL (Session :5432 limits; avoids IPv6-only db.* on some hosts).",
    );
    return txn;
  }

  if (process.env.SUPABASE_MIGRATE_USE_DIRECT === "true") {
    const direct = trySupabaseDirectFromPooler(primary);
    if (direct) {
      console.log("[migrations] Using direct db.*.supabase.co (SUPABASE_MIGRATE_USE_DIRECT=true).");
      return direct;
    }
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
