import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";

// Clean dist and recreate platform-specific directories
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
mkdirSync("dist/chrome", { recursive: true });
mkdirSync("dist/firefox", { recursive: true });

const entries = {
  background: "src/background/background.ts",
  content: "src/content/content.ts",
  injected: "src/interceptor/injected.ts",
  permissions: "src/permissions/permissions.ts",
};

// Build Chrome bundle
await build({
  entryPoints: entries,
  outdir: "dist/chrome",
  bundle: true,
  format: "iife",
  target: "firefox115",
  logLevel: "info",
});

// Build Firefox bundle
await build({
  entryPoints: entries,
  outdir: "dist/firefox",
  bundle: true,
  format: "iife",
  target: "firefox115",
  logLevel: "info",
});

// Copy permissions.html to both
cpSync("src/permissions/permissions.html", "dist/chrome/permissions.html");
cpSync("src/permissions/permissions.html", "dist/firefox/permissions.html");

// Read and parse root manifest.json
const manifestRaw = readFileSync("manifest.json", "utf8");
const manifest = JSON.parse(manifestRaw);

// Chrome Manifest (only service_worker; scripts is forbidden in Chrome MV3 dev mode)
const chromeManifest = { ...manifest };
chromeManifest.background = { service_worker: "background.js" };
writeFileSync("dist/chrome/manifest.json", JSON.stringify(chromeManifest, null, 2), "utf8");

// Firefox Manifest (must have scripts as a fallback/primary for Firefox MV3 Event Pages)
const firefoxManifest = { ...manifest };
firefoxManifest.background = { service_worker: "background.js", scripts: ["background.js"] };
writeFileSync("dist/firefox/manifest.json", JSON.stringify(firefoxManifest, null, 2), "utf8");

console.log("Built dist/chrome and dist/firefox");

