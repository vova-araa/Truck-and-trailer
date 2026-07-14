import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite build for a static SPA. Railway serves it with `vite preview`.
export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: Number(process.env.PORT) || 4173 },
  build: { outDir: "dist", sourcemap: false },
});
