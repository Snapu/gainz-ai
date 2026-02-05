/// <reference types="vitest" />
import { fileURLToPath, URL } from "node:url";
import legacy from "@vitejs/plugin-legacy";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import vueDevTools from "vite-plugin-vue-devtools";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/gainz-ai/" : "/",
  plugins: [
    vue(),
    legacy(),
    vueDevTools(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        enabled: true,
      },
      includeAssets: ["favicon.png", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Gainz AI",
        short_name: "Gainz AI",
        description: "Your AI-powered personal trainer and workout tracker",
        theme_color: "#3880ff",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
}));
