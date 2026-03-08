#!/usr/bin/env node
/**
 * 1) Delete the default set of generic email templates (so the console list is clean).
 * 2) Update components (centered header/footer logo, footer white logo).
 * 3) Create or update Sticky Green - Composed: 0 content images, 2 products, hero_1.
 *
 * Use the SAME Control Plane URL as your console (NEXT_PUBLIC_CONTROL_PLANE_API in Vercel):
 *
 *   node scripts/seed-email-for-console.mjs https://ai-factory-api-staging.onrender.com
 *
 * Prerequisites: migrations applied; Sticky Green brand (run seed-brand-sticky-green.mjs first).
 */
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const API = process.argv[2] ?? process.env.CONTROL_PLANE_URL ?? "";

if (!API.trim()) {
  console.error("Usage: node scripts/seed-email-for-console.mjs <CONTROL_PLANE_URL>");
  console.error("   or: CONTROL_PLANE_URL=https://... node scripts/seed-email-for-console.mjs");
  console.error("\nUse the same URL as NEXT_PUBLIC_CONTROL_PLANE_API in your console (e.g. Vercel env).");
  process.exit(1);
}

const base = API.replace(/\/$/, "");
console.log("Target Control Plane:", base);
console.log("");

function run(script, label, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [path.join(root, script), base, ...extraArgs], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, CONTROL_PLANE_URL: base },
    });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${label} exited ${code}`))));
    child.on("error", reject);
  });
}

(async () => {
  try {
    console.log("Step 1: Delete default generic templates...");
    await run("scripts/delete-email-templates-by-name.mjs", "delete-email-templates-by-name");
    console.log("");
    console.log("Step 2: Upsert email components (centered logos, footer white logo)...");
    await run("scripts/seed-email-component-library.mjs", "seed-email-component-library");
    console.log("");
    console.log("Step 3: Create/update Sticky Green - Composed (0 img, 2 prod)...");
    await run("scripts/seed-sticky-green-composed-template.mjs", "seed-sticky-green-composed-template");
    console.log("");
    console.log("Done. Open Document Templates and Component Registry in the console to verify.");
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
})();
