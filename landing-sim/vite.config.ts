import { defineConfig } from "vitest/config";

/** Production CSP — self-hosted assets only (fonts bundled via @fontsource). */
const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // 'unsafe-inline' covers canvas style attrs set by the renderer; no user HTML.
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");

/** Dev CSP — allow Vite HMR websocket + eval used by the dev client. */
const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' ws: wss:",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

export default defineConfig({
  root: ".",
  server: {
    port: 5173,
    host: true,
    headers: {
      "Content-Security-Policy": DEV_CSP,
    },
  },
  preview: {
    headers: {
      "Content-Security-Policy": PROD_CSP,
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  plugins: [
    {
      name: "inject-prod-csp-meta",
      transformIndexHtml: {
        order: "prepend",
        handler(html, ctx) {
          // Only bake meta CSP into production builds (static hosting).
          if (ctx.server) return html;
          const tag = `    <meta http-equiv="Content-Security-Policy" content="${PROD_CSP}" />\n`;
          return html.replace("<head>\n", `<head>\n${tag}`);
        },
      },
    },
  ],
});
