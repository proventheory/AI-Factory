import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Runtime proxy for `/api/control-plane/*` when `next.config.js` rewrites were not registered
 * (e.g. `NEXT_PUBLIC_CONTROL_PLANE_API` missing at build time on a Vercel preview). Without this
 * handler, the browser gets a Next.js 404 HTML page → `formatApiError` shows
 * "The requested resource was not found." and crawls / runs never reach the Control Plane.
 *
 * When a matching rewrite exists, Next applies it first and this route is not used.
 */
export const dynamic = "force-dynamic";

const HOP_BY_HOP = new Set(
  ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade", "host"].map((s) =>
    s.toLowerCase(),
  ),
);

function controlPlaneUpstreamBase(): string | null {
  const raw = (process.env.CONTROL_PLANE_PROXY_URL ?? process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "").trim();
  if (!raw) return null;
  const withProto = raw.startsWith("http") ? raw : `https://${raw}`;
  try {
    const u = new URL(withProto);
    const path = u.pathname.replace(/\/$/, "");
    return path ? `${u.origin}${path}` : u.origin;
  } catch {
    return null;
  }
}

async function proxy(req: NextRequest, pathSegments: string[]) {
  const base = controlPlaneUpstreamBase();

  // #region agent log
  fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a63a04" },
    body: JSON.stringify({
      sessionId: "a63a04",
      hypothesisId: "H1",
      location: "api/control-plane/[...path]/route.ts:proxy",
      message: "control-plane proxy",
      data: { hasBase: Boolean(base), segments: pathSegments.length, method: req.method },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (!base) {
    return NextResponse.json(
      {
        error:
          "Control Plane proxy is not configured. Set NEXT_PUBLIC_CONTROL_PLANE_API or CONTROL_PLANE_PROXY_URL on the console (Vercel) environment, then redeploy.",
      },
      { status: 503 },
    );
  }

  const subpath = pathSegments.join("/");
  const target = `${base}/${subpath}${req.nextUrl.search}`;
  const headers = new Headers(req.headers);
  for (const h of HOP_BY_HOP) headers.delete(h);

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  };
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    const ab = await req.arrayBuffer();
    if (ab.byteLength > 0) init.body = ab;
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (e) {
    // #region agent log
    fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a63a04" },
      body: JSON.stringify({
        sessionId: "a63a04",
        hypothesisId: "H2",
        location: "api/control-plane/[...path]/route.ts:proxy",
        message: "upstream fetch error",
        data: { err: String(e) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return NextResponse.json({ error: "Upstream Control Plane unreachable" }, { status: 502 });
  }

  // #region agent log
  fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a63a04" },
    body: JSON.stringify({
      sessionId: "a63a04",
      hypothesisId: "H3",
      location: "api/control-plane/[...path]/route.ts:proxy",
      message: "upstream status",
      data: {
        status: upstream.status,
        host: (() => {
          try {
            return new URL(target).hostname;
          } catch {
            return "";
          }
        })(),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) outHeaders.set(key, value);
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

type Ctx = { params: { path: string[] } };

async function handle(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path ?? []);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
