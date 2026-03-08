/**
 * Artifact storage: signed URLs and download for Supabase Storage.
 * Shared logic with runners; kept in control-plane so tsc rootDir is satisfied.
 * Bucket: "artifacts".
 */

const BUCKET = "artifacts";

let _client: unknown = null;

async function getClient(): Promise<unknown> {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const mod = await import("@supabase/supabase-js");
    _client = mod.createClient(url, key);
    return _client;
  } catch {
    return null;
  }
}

export async function getArtifactSignedUrl(storagePath: string): Promise<string | null> {
  const client = await getClient() as { storage: { from: (n: string) => { createSignedUrl: (p: string, e: number) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }> } } } | null;
  if (!client) return null;
  const cleanPath = storagePath.replace(`supabase-storage://${BUCKET}/`, "").replace(`storage://${BUCKET}/`, "");
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(cleanPath, 3600);
  if (error) { console.error("[artifact-storage] Signed URL failed:", error.message); return null; }
  return data?.signedUrl ?? null;
}

export async function downloadArtifact(storagePath: string): Promise<string | null> {
  const client = await getClient() as { storage: { from: (n: string) => { download: (p: string) => Promise<{ data: Blob | null; error: { message: string } | null }> } } } | null;
  if (!client) return null;
  const cleanPath = storagePath.replace(`supabase-storage://${BUCKET}/`, "").replace(`storage://${BUCKET}/`, "");
  const { data, error } = await client.storage.from(BUCKET).download(cleanPath);
  if (error) { console.error("[artifact-storage] Download failed:", error.message); return null; }
  return data ? await data.text() : null;
}
