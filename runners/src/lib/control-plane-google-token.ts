/**
 * OAuth access token for an initiative: minted on the Control Plane (has GOOGLE_OAUTH_* + encryption key).
 * WP → Shopify wizard jobs usually embed a prefetched token at enqueue time so the runner does not depend on CONTROL_PLANE_URL.
 * Use OrThrow when falling back so failures are visible in job_events / UI instead of a generic OAuth error.
 */

export async function getGoogleAccessTokenFromControlPlaneOrThrow(initiativeId: string): Promise<string> {
  const base = (process.env.CONTROL_PLANE_URL ?? "http://localhost:3001").replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/v1/initiatives/${encodeURIComponent(initiativeId)}/google_access_token`);
  } catch (e) {
    throw new Error(
      `Runner could not reach Control Plane at ${base} (set CONTROL_PLANE_URL to the public API URL, e.g. https://your-api.onrender.com). ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const text = await res.text();
  let data: { access_token?: string; error?: string } = {};
  try {
    data = text ? (JSON.parse(text) as typeof data) : {};
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const snippet = text.trim().slice(0, 400);
    const fallback = `Google token request failed (HTTP ${res.status}).`;
    const detail = data.error ?? (snippet || fallback);
    throw new Error(detail);
  }
  const t = data.access_token;
  if (typeof t !== "string" || !t.trim()) {
    throw new Error("Control Plane returned no access_token after refresh.");
  }
  return t.trim();
}

/** Soft failure: returns undefined on any error (legacy SEO snapshot handlers). */
export async function getGoogleAccessTokenFromControlPlane(initiativeId: string): Promise<string | undefined> {
  try {
    return await getGoogleAccessTokenFromControlPlaneOrThrow(initiativeId);
  } catch {
    return undefined;
  }
}
