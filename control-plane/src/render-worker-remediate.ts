/**
 * Self-heal: no-artifacts remediation.
 * When runs have no artifacts (worker misconfigured), sync Render worker env from Control Plane
 * so jobs get claimed and artifacts are produced. No human in the loop.
 *
 * Requires: ENABLE_SELF_HEAL=true, RENDER_API_KEY set.
 * Worker service name: ai-factory-runner-staging (from render.yaml).
 */

const RENDER_API_BASE = "https://api.render.com/v1";
const WORKER_SERVICE_NAME = "ai-factory-runner-staging";

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
 * Update environment variables for a Render service.
 * Render API: PATCH /services/:id with body { envVars: [{ key, value }], replace: false }.
 * See https://api-docs.render.com/reference/update-env-vars-for-service
 */
export async function updateServiceEnvVars(
  apiKey: string,
  serviceId: string,
  envVars: { key: string; value: string }[],
  replace: boolean = false
): Promise<void> {
  const res = await fetch(`${RENDER_API_BASE}/services/${serviceId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ envVars, replace }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Render API update env vars failed: ${res.status} ${text}`);
  }
}

/**
 * Sync worker service env from Control Plane process env (DATABASE_URL, CONTROL_PLANE_URL, LLM_GATEWAY_URL).
 * Control Plane runs on Render with these set; worker must have the same to claim jobs and produce artifacts.
 */
export async function syncWorkerEnvFromControlPlane(): Promise<SyncResult> {
  const apiKey = process.env.RENDER_API_KEY;
  if (!apiKey?.trim()) {
    return { ok: false, message: "RENDER_API_KEY not set" };
  }

  const databaseUrl = process.env.DATABASE_URL;
  const controlPlaneUrl = process.env.CONTROL_PLANE_URL;
  const llmGatewayUrl = process.env.LLM_GATEWAY_URL;

  if (!databaseUrl?.trim()) {
    return { ok: false, message: "DATABASE_URL not set on Control Plane" };
  }

  const services = await listRenderServices(apiKey);
  const worker = services.find(
    (s) =>
      (s.name && s.name.toLowerCase() === WORKER_SERVICE_NAME.toLowerCase()) ||
      (s.slug && s.slug.toLowerCase() === WORKER_SERVICE_NAME.toLowerCase())
  );
  if (!worker) {
    return { ok: false, message: `Worker service '${WORKER_SERVICE_NAME}' not found in Render` };
  }

  const envVars: { key: string; value: string }[] = [
    { key: "DATABASE_URL", value: databaseUrl },
  ];
  if (controlPlaneUrl?.trim()) {
    envVars.push({ key: "CONTROL_PLANE_URL", value: controlPlaneUrl.trim() });
  }
  if (llmGatewayUrl?.trim()) {
    envVars.push({ key: "LLM_GATEWAY_URL", value: llmGatewayUrl.trim() });
  }

  await updateServiceEnvVars(apiKey, worker.id, envVars, false);
  return {
    ok: true,
    message: "Worker env synced",
    workerServiceId: worker.id,
    updated: envVars.map((e) => e.key),
  };
}
