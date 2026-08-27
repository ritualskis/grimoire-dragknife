import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { resolve } from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({
  plugins: [solid()],

  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@components": resolve(__dirname, "src/components"),
      "@lib": resolve(__dirname, "src/lib"),
      "@styles": resolve(__dirname, "src/styles"),
      "@types": resolve(__dirname, "src/types"),
      "@assets": resolve(__dirname, "src/assets"),
      "@grimoire/plotter-2d": resolve(__dirname, "../grimoire-2d/src/index.ts"),
    },
  },

  clearScreen: false,
  server: {
    port: 1425,
    strictPort: true,
    host: host ?? false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1426,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
