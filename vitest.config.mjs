import { defineConfig } from "vitest/config";

// The extension is built once, before any test file runs: files run side by side, and a pi one of them starts loads `dist/` while it stands.
export default defineConfig({ test: { globalSetup: ["./test/build.global.mjs"] } });
