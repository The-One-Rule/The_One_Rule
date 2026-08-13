import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: { target: "es2022", assetsInlineLimit: 4096, cssCodeSplit: false },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
