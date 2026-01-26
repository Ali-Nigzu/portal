import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "build",
    assetsDir: "static",
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
