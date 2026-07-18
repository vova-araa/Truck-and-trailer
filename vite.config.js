import { defineConfig } from "vite";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Vite build voor de SPA. In productie serveert server/index.js de dist/ map
// en de /api routes (AI-proxy). In dev proxy't Vite /api naar die server.
// De productie-build bevat alleen de echte app (index.html). De losse
// seed-data demo bouw je apart met vite.standalone.config.js (draagbaar bestand),
// zodat de live site meteen de echte inlog toont.
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
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
      output: {
        // Splits grote, stabiele libraries in eigen chunks zodat de browser ze
        // apart cachet en de app-code klein blijft.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("/react") || id.includes("react-dom") || id.includes("scheduler")) return "react";
          if (id.includes("lucide-react")) return "icons";
          return "vendor";
        },
      },
    },
  },
});
