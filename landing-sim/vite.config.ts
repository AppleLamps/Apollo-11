import { defineConfig } from "vitest/config";

export default defineConfig({
  root: ".",
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: "dist",
    // Keep source maps out of production artifacts
    sourcemap: false,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
