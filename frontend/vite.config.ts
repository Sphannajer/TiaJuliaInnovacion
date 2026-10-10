import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["logo-tia-julia.svg", "favicon.svg"],
      manifest: {
        name: "Tía Julia — Ventas y Órdenes",
        short_name: "Tía Julia",
        description: "Sistema de ventas, órdenes, inventario y analítica para la juguería Tía Julia",
        theme_color: "#C92429",
        background_color: "#F6F3E6",
        display: "standalone",
        orientation: "landscape",
        start_url: "/",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        // Catalog pages benefit from a small runtime cache; sales flow is queued in IndexedDB.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/v1/products") || url.pathname.startsWith("/api/v1/categories") || url.pathname.startsWith("/api/v1/option-groups") || url.pathname.startsWith("/api/v1/users"),
            handler: "NetworkFirst",
            options: {
              cacheName: "catalog-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});

// Vitest config (merged separately to keep Vite config valid TS)
export const vitestConfig = {
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/tests/setup.ts",
  },
};
