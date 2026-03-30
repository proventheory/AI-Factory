/**
 * Runner ↔ Control Plane Google token helper (wizard + SEO snapshots).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getGoogleAccessTokenFromControlPlane } from "../src/lib/control-plane-google-token.js";

describe("getGoogleAccessTokenFromControlPlane", () => {
  it("returns access_token when control plane responds 200", async (t) => {
    const origFetch = globalThis.fetch;
    const origEnv = process.env.CONTROL_PLANE_URL;
    process.env.CONTROL_PLANE_URL = "https://cp.example.com";

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const u = String(input);
      assert.match(u, /\/v1\/initiatives\/init-abc\/google_access_token$/);
      return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    t.after(() => {
      globalThis.fetch = origFetch;
      if (origEnv === undefined) delete process.env.CONTROL_PLANE_URL;
      else process.env.CONTROL_PLANE_URL = origEnv;
    });

    const tok = await getGoogleAccessTokenFromControlPlane("init-abc");
    assert.strictEqual(tok, "ya29.test");
  });

  it("returns undefined on 404", async (t) => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ error: "no" }), { status: 404 });

    t.after(() => {
      globalThis.fetch = origFetch;
    });

    const tok = await getGoogleAccessTokenFromControlPlane("init-x");
    assert.strictEqual(tok, undefined);
  });

  it("encodes initiative id in URL", async (t) => {
    const origFetch = globalThis.fetch;
    const seen: string[] = [];
    globalThis.fetch = async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return new Response(JSON.stringify({ access_token: "t" }), { status: 200 });
    };

    t.after(() => {
      globalThis.fetch = origFetch;
    });

    await getGoogleAccessTokenFromControlPlane("00000000-0000-0000-0000-000000000001");
    assert.ok(seen[0]?.includes(encodeURIComponent("00000000-0000-0000-0000-000000000001")));
  });
});
