/// <reference types="vitest/config" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@reactify/shared": path.resolve(rootDir, "../../packages/shared/src/index.ts"),
      "@reactify/ui": path.resolve(rootDir, "../../packages/ui/src/index.ts"),
      "@reactify/generation-contracts": path.resolve(
        rootDir,
        "../../packages/generation-contracts/src/index.ts",
      ),
    },
  },
  server: {
    port: 5173,
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
