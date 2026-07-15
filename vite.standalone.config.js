import { defineConfig } from "vite";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Bouwt de demo als één self-contained HTML-bestand (alle JS + CSS inline,
// geen externe requests). Handig om de app zonder server/host te tonen:
//   npm run build:standalone   ->  dist-standalone/demo.html
// Dat ene bestand kun je lokaal openen, mailen of op elke statische host zetten.
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: "dist-standalone",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: resolve(__dirname, "demo.html"),
    },
  },
});
