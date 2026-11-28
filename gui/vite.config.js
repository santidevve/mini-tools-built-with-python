import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5199,
    proxy: {
      "/api": "http://127.0.0.1:4310",
      "/jobs": "http://127.0.0.1:4310",
      "/sources": "http://127.0.0.1:4310",
      "/settings": "http://127.0.0.1:4310",
      "/screenshots": "http://127.0.0.1:4310",
      "/ws": { target: "ws://127.0.0.1:4310", ws: true },
    },
  },
});