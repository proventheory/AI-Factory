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
/** Long POSTs (e.g. crawl_execute). Vercel clamps by plan (300s typical Pro cap; Hobby ~10s — use direct CP URL + CORS if needed). */
export const maxDuration = 300;

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
    return NextResponse.json(
      {
        error: `Upstream Control Plane unreachable: ${String((e as Error).message || e)}`,
      },
      { status: 502 },
    );
  }

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
