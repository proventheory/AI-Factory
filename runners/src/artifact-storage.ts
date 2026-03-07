/**
 * Artifact storage: upload blobs to Supabase Storage, download via signed URLs.
 *
 * Decision: Supabase Storage (not S3). Already have Supabase, zero new infra.
 * Bucket: "artifacts" — created automatically if missing.
 *
 * Uses dynamic import for @supabase/supabase-js so it doesn't break if
 * the package isn't installed in the runners workspace (only needed at runtime).
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

async function ensureBucket(client: { storage: { getBucket: (n: string) => Promise<{ data: unknown }>; createBucket: (n: string, o: { public: boolean }) => Promise<unknown> } }): Promise<void> {
  const { data } = await client.storage.getBucket(BUCKET);
  if (!data) {
    await client.storage.createBucket(BUCKET, { public: false });
  }
}

export async function uploadArtifact(
  runId: string,
  artifactId: string,
  content: string | Buffer,
  contentType: string = "application/json",
): Promise<string | null> {
  const client = await getClient() as { storage: { getBucket: (n: string) => Promise<{ data: unknown }>; createBucket: (n: string, o: { public: boolean }) => Promise<unknown>; from: (n: string) => { upload: (p: string, b: Uint8Array, o: { contentType: string; upsert: boolean }) => Promise<{ error: { message: string } | null }> } } } | null;
  if (!client) return null;

  await ensureBucket(client);
  const path = `${runId}/${artifactId}.json`;
  const body = typeof content === "string" ? new TextEncoder().encode(content) : new Uint8Array(content);
  const { error } = await client.storage.from(BUCKET).upload(path, body, { contentType, upsert: true });
  if (error) { console.error("[artifact-storage] Upload failed:", error.message); return null; }
  return `supabase-storage://${BUCKET}/${path}`;
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

export async function isStorageConfigured(): Promise<boolean> {
  return (await getClient()) !== null;
}
