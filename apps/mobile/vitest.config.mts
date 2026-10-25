import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Resolves the "@/" alias that the app code uses.
 *
 * Without this, a module importing "@/db/open" cannot be loaded under vitest
 * at all, so the only testable files were the ones that happened to import
 * nothing but relative paths and workspace packages. That is a poor reason for
 * a module to go untested.
 *
 * Mirrors the `paths` entry in tsconfig.json; the two have to agree.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") }
  }
});
