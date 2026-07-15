import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Vite build voor de SPA. In productie serveert server/index.js de dist/ map
// en de /api routes (AI-proxy). In dev proxy't Vite /api naar die server.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  preview: { host: true, port: Number(process.env.PORT) || 4173 },
  build: { outDir: "dist", sourcemap: false },
});
