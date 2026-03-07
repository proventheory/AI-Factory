/**
 * Self-heal: no-artifacts remediation.
 * When runs have no artifacts (worker misconfigured), sync Render worker env from Control Plane
 * so jobs get claimed and artifacts are produced. No human in the loop.
 *
 * Requires: ENABLE_SELF_HEAL=true, RENDER_API_KEY set.
 * Worker service: set RENDER_WORKER_SERVICE_NAME to the exact name/slug in Render (default: ai-factory-runner-staging).
 */

const RENDER_API_BASE = "https://api.render.com/v1";
const WORKER_SERVICE_NAME = process.env.RENDER_WORKER_SERVICE_NAME?.trim() || "ai-factory-runner-staging";

export interface SyncResult {
  ok: boolean;
  message: string;
  workerServiceId?: string;
  updated?: string[];
}

/**
 * List services from Render API. Returns services with id, name, slug.
 */
export async function listRenderServices(apiKey: string): Promise<{ id: string; name?: string; slug?: string }[]> {
  const res = await fetch(`${RENDER_API_BASE}/services?limit=100`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Render API list services failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { id?: string; name?: string; slug?: string }[] | { services?: { id: string; name?: string; slug?: string }[] };
  const list = Array.isArray(data) ? data : (data as { services?: { id: string; name?: string; slug?: string }[] }).services ?? [];
  return list.map((s: { id?: string; name?: string; slug?: string }) => ({
    id: s.id!,
    name: s.name,
    slug: s.slug,
  }));
}

/**
 * Add or update one environment variable for a Render service.
 * Render API: PUT /services/:id/env-vars/:key with body { value }.
 * Does not remove other env vars.
 */
export async function setServiceEnvVar(
  apiKey: string,
  serviceId: string,
  key: string,
  value: string
): Promise<void> {
  const encodedKey = encodeURIComponent(key);
  const res = await fetch(`${RENDER_API_BASE}/services/${serviceId}/env-vars/${encodedKey}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Render API set env var ${key} failed: ${res.status} ${text}`);
  }
}

/**
 * Restart a Render service so it picks up new env vars.
 * Render API: POST /services/:id/restart. See https://api-docs.render.com/reference/restart-service
 */
export async function restartRenderService(apiKey: string, serviceId: string): Promise<void> {
  const res = await fetch(`${RENDER_API_BASE}/services/${serviceId}/restart`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Render API restart service failed: ${res.status} ${text}`);
  }
}

/**
 * Sync worker service env from Control Plane process env (DATABASE_URL, CONTROL_PLANE_URL, LLM_GATEWAY_URL).
 * Worker must have the same to claim jobs and produce artifacts. API keys stay in gateway only.
 * After updating env vars we restart the worker so it picks up the new values.
 */
export async function syncWorkerEnvFromControlPlane(): Promise<SyncResult> {
  const apiKey = process.env.RENDER_API_KEY;
  if (!apiKey?.trim()) {
    return { ok: false, message: "RENDER_API_KEY not set" };
  }

  const databaseUrl = process.env.DATABASE_URL;
  let controlPlaneUrl = process.env.CONTROL_PLANE_URL?.trim();
  const llmGatewayUrl = process.env.LLM_GATEWAY_URL?.trim();

  if (!databaseUrl?.trim()) {
    return { ok: false, message: "DATABASE_URL not set on Control Plane" };
  }

  const services = await listRenderServices(apiKey);
  const want = WORKER_SERVICE_NAME.toLowerCase();
  const baseName = want.replace(/-?(staging|prod)$/i, "").trim(); // e.g. "ai-factory-runner-staging" -> "ai-factory-runner"
  const worker =
    services.find(
      (s) =>
        (s.name && s.name.toLowerCase() === want) ||
        (s.slug && s.slug.toLowerCase() === want)
    ) ??
    (baseName !== want
      ? services.find(
          (s) =>
            (s.name && s.name.toLowerCase() === baseName) ||
            (s.slug && s.slug.toLowerCase() === baseName)
        )
      : undefined);
  if (!worker) {
    const hints = services
      .filter((s) => (s.slug ?? s.name ?? "").toLowerCase().includes("runner"))
      .map((s) => s.slug ?? s.name ?? s.id)
      .slice(0, 5);
    const hint = hints.length ? ` (Render services with "runner": ${hints.join(", ")})` : "";
    return {
      ok: false,
      message: `Worker service '${WORKER_SERVICE_NAME}' not found in Render${hint}. Set RENDER_WORKER_SERVICE_NAME to the exact service slug (e.g. from the service URL: <slug>.onrender.com).`,
    };
  }

  if (!controlPlaneUrl) {
    const apiService = services.find(
      (s) =>
        (s.name && /ai-factory-api-(staging|prod)/i.test(s.name)) ||
        (s.slug && /ai-factory-api-(staging|prod)/i.test(s.slug))
    );
    if (apiService?.slug) {
      controlPlaneUrl = `https://${apiService.slug}.onrender.com`;
    }
  }

  const envVars: { key: string; value: string }[] = [
    { key: "DATABASE_URL", value: databaseUrl },
  ];
  if (controlPlaneUrl) {
    envVars.push({ key: "CONTROL_PLANE_URL", value: controlPlaneUrl });
  }
  if (llmGatewayUrl) {
    envVars.push({ key: "LLM_GATEWAY_URL", value: llmGatewayUrl });
  }

  for (const { key, value } of envVars) {
    await setServiceEnvVar(apiKey, worker.id, key, value);
  }
  try {
    await restartRenderService(apiKey, worker.id);
  } catch (err) {
    console.warn("[render-worker-remediate] Env synced but restart failed:", (err as Error).message);
  }
  return {
    ok: true,
    message: "Worker env synced and restarted",
    workerServiceId: worker.id,
    updated: envVars.map((e) => e.key),
  };
}
