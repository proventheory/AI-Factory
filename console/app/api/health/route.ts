/**
 * JSON health endpoint for probes (Vercel, load balancers).
 * UI health page remains at /health; this route returns machine-readable status.
 * See docs/MAESTRON_RECON_2026-03-16.md (recommendation: dedicated JSON health).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      ok: true,
      service: "console",
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
