/**
 * OAuth access token for an initiative: minted on the Control Plane (has GOOGLE_OAUTH_* + encryption key).
 * Runners should use this instead of calling getAccessTokenForBrand/getAccessTokenForInitiative with DB rows directly,
 * which requires the same secrets on the worker and fails on Render if only the API service has them.
 */

export async function getGoogleAccessTokenFromControlPlane(initiativeId: string): Promise<string | undefined> {
  const base = (process.env.CONTROL_PLANE_URL ?? "http://localhost:3001").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/v1/initiatives/${encodeURIComponent(initiativeId)}/google_access_token`);
    if (!res.ok) return undefined;
    const data = (await res.json()) as { access_token?: string };
    return typeof data.access_token === "string" ? data.access_token : undefined;
  } catch {
    return undefined;
  }
}
