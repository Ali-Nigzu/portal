import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "build",
    assetsDir: "static",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep the shared bootstrap helper outside the PDF dependency subtree.
          if (id === "\0vite/preload-helper.js") return "vite-preload-helper";
          if (!id.includes("node_modules")) {
            return undefined;
          }
          const [, modulePath] = id.split("node_modules/");
          if (!modulePath) {
            return undefined;
          }
          if (modulePath.startsWith("tabbable/")) {
            return undefined;
          }
          const parts = modulePath.split("/");
          const name = parts[0].startsWith("@")
            ? `${parts[0]}/${parts[1]}`
            : parts[0];
          return `vendor-${name.replace("@", "").replace("/", "-")}`;
        },
      },
    },
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
