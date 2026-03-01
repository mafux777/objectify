import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { specsPlugin } from "./vite-specs-plugin.js";

export default defineConfig({
  plugins: [react(), specsPlugin()],
  envDir: "../..",
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
