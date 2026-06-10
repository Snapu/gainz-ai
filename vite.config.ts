/// <reference types="vitest" />
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import legacy from "@vitejs/plugin-legacy";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import vueDevTools from "vite-plugin-vue-devtools";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const base = mode === "production" ? "/gainz-ai/" : "/";

  return {
    base,
    plugins: [
      vue(),
      tailwindcss(),

      legacy(),
      vueDevTools(),
      VitePWA({
        registerType: "prompt",
        strategies: "injectManifest",
        srcDir: "public",
        filename: "service-worker.ts",
        devOptions: {
          enabled: false,
          type: "module",
        },
        includeAssets: ["favicon.png", "icon-192.png", "icon-512.png"],
        manifest: {
          name: "Gainz AI",
          short_name: "Gainz AI",
          description: "Your AI-powered personal trainer and workout tracker",
          theme_color: "#3880ff",
          background_color: "#ffffff",
          display: "standalone",
          orientation: "portrait",
          start_url: base,
          scope: base,
          icons: [
            {
              src: `${base}icon-192.png`,
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: `${base}icon-512.png`,
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
    test: {
      environment: "jsdom",
      setupFiles: ["src/vitest.setup.ts"],
    },
  };
});
