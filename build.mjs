import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

// Overwrite files in-place to avoid breaking Firefox's script cache
// rmSync("dist", { recursive: true, force: true });
// mkdirSync("dist", { recursive: true });

const entries = {
  background: "src/background/background.ts",
  content: "src/content/content.ts",
  injected: "src/interceptor/injected.ts",
  permissions: "src/permissions/permissions.ts",
};

await build({
  entryPoints: entries,
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "firefox115",
  logLevel: "info",
});

cpSync("manifest.json", "dist/manifest.json");
cpSync("src/permissions/permissions.html", "dist/permissions.html");
console.log("Built dist/ with", Object.keys(entries).join(", "));

