# AID Story Helper - Build Instructions

This document provides step-by-step instructions to compile and package the extension from its original source files.

## Build Environment Requirements
- **Operating System:** Platform-agnostic (Windows 10/11, macOS, or Linux).
- **Tooling:** Node.js (v18.0.0 or higher) and npm (v9.0.0 or higher) must be installed.

## Step-by-Step Build Steps
1. Extract the source archive contents into a clean directory.
2. Open a terminal / command prompt in that directory.
3. Install the package dependencies by running:
   ```bash
   npm install
   ```
4. Execute the build pipeline script by running:
   ```bash
   npm run build
   ```

## Build Artifact Output
The bundler script (`build.mjs` running via `esbuild`) will compile the TypeScript source files and copy the manifest to the `dist/` directory:
- `dist/manifest.json` (Extension manifest configuration)
- `dist/background.js` (Extension background service worker)
- `dist/content.js` (Extension content script)
- `dist/injected.js` (Page-world fetch interceptor script)

These generated files in the `dist/` directory constitute the exact copy of the submitted extension's binary assets.
