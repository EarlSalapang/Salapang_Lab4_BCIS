import { config as loadEnvironment } from "dotenv";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { fileURLToPath } from "node:url";

loadEnvironment({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
});

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["@bcis/shared"] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react(), tailwindcss()],
  },
});
