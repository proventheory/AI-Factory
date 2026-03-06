/**
 * Copy an image from a public URL to Supabase Storage (CDN) so campaign emails have stable image URLs.
 * Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY so Control Plane can upload without RLS.
 */

const BUCKET = "upload";
const PREFIX = "campaign-images";

export async function getSupabaseStorageClient(): Promise<ReturnType<typeof import("@supabase/supabase-js")["createClient"]> | null> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key);
}

function extFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const match = /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.exec(path);
    return (match?.[1] ?? "jpg").toLowerCase().replace("jpeg", "jpg");
  } catch {
    return "jpg";
  }
}

/**
 * Fetch image from URL and upload to Supabase Storage. Returns public CDN URL or null on failure.
 */
export async function copyImageToCdn(imageUrl: string): Promise<{ cdn_url: string } | null> {
  const client = await getSupabaseStorageClient();
  if (!client) return null;

  const res = await fetch(imageUrl, { headers: { "User-Agent": "AI-Factory-Control-Plane/1.0" } });
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const buffer = await res.arrayBuffer();
  const ext = extFromUrl(imageUrl);
  const path = `${PREFIX}/${crypto.randomUUID()}.${ext}`;

  const { error } = await client.storage.from(BUCKET).upload(path, new Uint8Array(buffer), {
    contentType: contentType.startsWith("image/") ? contentType : "image/jpeg",
    upsert: false,
  });
  if (error) {
    console.error("[campaign-images-storage] Upload failed:", error.message);
    return null;
  }
  const { data } = client.storage.from(BUCKET).getPublicUrl(path);
  return { cdn_url: data.publicUrl };
}
