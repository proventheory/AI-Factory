"use strict";
const esbuild = require("esbuild");
const path = require("path");

const root = path.resolve(__dirname, "..");
const entry = path.join(root, "control-plane/src/index.ts");
const outfile = path.join(root, "dist/control-plane-bundle.js");

esbuild
  .build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    target: "node20",
    outfile,
    format: "cjs",
    sourcemap: true,
    external: ["pg", "express", "cors", "uuid"],
  })
  .then(() => console.log("Built", outfile))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
