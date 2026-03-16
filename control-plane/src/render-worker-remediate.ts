/**
 * Self-heal: no-artifacts remediation.
 * When runs have no artifacts (worker misconfigured), sync Render worker env from Control Plane
 * so jobs get claimed and artifacts are produced. No human in the loop.
 *
 * Requires: ENABLE_SELF_HEAL=true, RENDER_API_KEY set.
 * Worker: set RENDER_WORKER_SERVICE_ID to the Render service ID (most reliable), or
 * RENDER_WORKER_SERVICE_NAME to the exact name/slug (default: ai-factory-runner-staging).
 */

const RENDER_API_BASE = "https://api.render.com/v1";
const WORKER_SERVICE_ID = process.env.RENDER_WORKER_SERVICE_ID?.trim();
const WORKER_SERVICE_NAME = process.env.RENDER_WORKER_SERVICE_NAME?.trim() || "ai-factory-runner-staging";

function normalize(s: string): string {
  return s.toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
}

export interface SyncResult {
  ok: boolean;
  message: string;
  workerServiceId?: string;
  updated?: string[];
}

/**
 * Get a single service by ID from Render API. Returns id, name, slug or null if not found.
 */
export async function getRenderService(
  apiKey: string,
  serviceId: string
): Promise<{ id: string; name?: string; slug?: string } | null> {
  const res = await fetch(`${RENDER_API_BASE}/services/${serviceId}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Render API get service failed: ${res.status} ${await res.text()}`);
  }
  const s = (await res.json()) as { id?: string; name?: string; slug?: string };
  return s?.id ? { id: s.id, name: s.name, slug: s.slug } : null;
}

/**
 * List services from Render API. Returns services with id, name, slug.
 * Handles array or object with items/services.
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
  const data = (await res.json()) as
    | { id?: string; name?: string; slug?: string }[]
    | { services?: { id: string; name?: string; slug?: string }[]; items?: { id: string; name?: string; slug?: string }[] };
  const list = Array.isArray(data)
    ? data
    : (data as { services?: { id: string; name?: string; slug?: string }[] }).services ??
      (data as { items?: { id: string; name?: string; slug?: string }[] }).items ??
      [];
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
 * Return staging service IDs to monitor for deploy-failure (api, gateway, runner).
 * From env RENDER_STAGING_SERVICE_IDS (comma-separated) or RENDER_WORKER_SERVICE_ID only.
 */
export async function getStagingServiceIds(): Promise<string[]> {
  const ids = process.env.RENDER_STAGING_SERVICE_IDS?.trim();
  if (ids) return ids.split(",").map((s) => s.trim()).filter(Boolean);
  const workerId = process.env.RENDER_WORKER_SERVICE_ID?.trim();
  if (workerId) return [workerId];
  return [];
}

/**
 * List recent deploys for a Render service. Returns id, status, commit.
 */
export async function listRenderDeploys(
  apiKey: string,
  serviceId: string,
  limit: number = 5
): Promise<{ id: string; status: string; commit?: string }[]> {
  const res = await fetch(
    `${RENDER_API_BASE}/services/${serviceId}/deploys?limit=${Math.min(limit, 20)}`,
    {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
    }
  );
  if (!res.ok) throw new Error(`Render API list deploys failed: ${res.status} ${await res.text()}`);
  const raw = (await res.json()) as unknown;
  const arr = Array.isArray(raw) ? raw : (raw as { deploys?: unknown[] })?.deploys ?? [];
  return arr.map((item: { deploy?: { id: string; status: string; commit?: { id?: string } }; id?: string; status?: string; commit?: { id?: string } }) => {
    const d = item.deploy ?? item;
    return { id: d.id!, status: d.status!, commit: d.commit?.id };
  });
}

/**
 * Trigger a new deploy for a Render service (optionally clear build cache).
 */
export async function triggerRenderDeploy(
  apiKey: string,
  serviceId: string,
  clearCache: boolean = false
): Promise<{ id?: string }> {
  const res = await fetch(`${RENDER_API_BASE}/services/${serviceId}/deploys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ clearCache: clearCache ? "clear" : "do_not_clear" }),
  });
  if (!res.ok) throw new Error(`Render API trigger deploy failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { id?: string };
  return data;
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

  let worker: { id: string; name?: string; slug?: string } | null = null;

  if (WORKER_SERVICE_ID) {
    worker = await getRenderService(apiKey, WORKER_SERVICE_ID);
    if (!worker) {
      return {
        ok: false,
        message: `Worker service ID '${WORKER_SERVICE_ID}' not found in Render. Check RENDER_WORKER_SERVICE_ID (from Render dashboard → service → URL or API).`,
      };
    }
  }

  if (!worker) {
    const services = await listRenderServices(apiKey);
    const want = normalize(WORKER_SERVICE_NAME);
    const baseName = want.replace(/-?(staging|prod)$/i, "").trim();
    worker =
      services.find(
        (s) =>
          (s.name && normalize(s.name) === want) ||
          (s.slug && normalize(s.slug) === want)
      ) ??
      (baseName !== want
        ? services.find(
            (s) =>
              (s.name && normalize(s.name) === baseName) ||
              (s.slug && normalize(s.slug) === baseName)
          )
        : undefined) ??
      services.find(
        (s) => {
          const n = normalize(s.slug ?? s.name ?? "");
          return n.includes("runner") && (n.includes("staging") || n.includes("ai-factory-runner"));
        }
      ) ??
      null;

    if (!worker) {
      const hints = services
        .filter((s) => (s.slug ?? s.name ?? "").toLowerCase().includes("runner"))
        .map((s) => s.slug ?? s.name ?? s.id)
        .slice(0, 10);
      const hint = hints.length ? ` (Render services with "runner": ${hints.join(", ")})` : "";
      const idHint =
        " Or set RENDER_WORKER_SERVICE_ID to the service ID from Render dashboard (service → Settings or URL).";
      return {
        ok: false,
        message: `Worker service '${WORKER_SERVICE_NAME}' not found in Render${hint}. Set RENDER_WORKER_SERVICE_NAME to the exact service slug, or RENDER_WORKER_SERVICE_ID to the service ID.${idHint}`,
      };
    }
  }

  if (!controlPlaneUrl) {
    const servicesForApi = await listRenderServices(apiKey);
    const apiService = servicesForApi.find(
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
