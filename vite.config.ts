/// <reference types="vitest" />
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import legacy from "@vitejs/plugin-legacy";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import vueDevTools from "vite-plugin-vue-devtools";
import { configDefaults } from "vitest/config";

// https://vitejs.dev/config/
export default defineConfig(() => {
  const base = "/";

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
        integration: {
          configureCustomSWViteBuild(options) {
            const output = options.build?.rollupOptions?.output;
            if (output && !Array.isArray(output) && "inlineDynamicImports" in output) {
              delete output.inlineDynamicImports;
              (output as Record<string, unknown>).codeSplitting = false;
            }
          },
        },
        devOptions: {
          enabled: false,
          type: "module",
        },
        includeAssets: ["favicon.png", "icon-192.png", "icon-512.png"],
        injectManifest: {
          globPatterns: ["**/*.{js,css,html,woff2}"],
        },
        manifest: {
          name: "Gainz AI",
          short_name: "Gainz AI",
          description: "Your AI-powered personal trainer and workout tracker",
          theme_color: "#080C10",
          background_color: "#080C10",
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
      {
        name: "vitest-deno-npm-specifier-stub",
        resolveId(id) {
          if (process.env.VITEST && id === "npm:jose@5.10.0") {
            return "\0vitest-npm-jose";
          }
        },
        load(id) {
          if (id === "\0vitest-npm-jose") {
            return "export const createRemoteJWKSet = () => () => {}; export const jwtVerify = async () => ({ payload: {} });";
          }
        },
      },
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["src/vitest.setup.ts"],
      exclude: [...configDefaults.exclude, "**/*.deno.test.ts"],
    },
  };
});
