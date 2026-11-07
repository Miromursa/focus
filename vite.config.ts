import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Set BASE_PATH (for example "/focus/") when the app is hosted under a sub-path, such as GitHub Pages.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  // One ~200 KB (gzip) bundle, precached by the service worker; splitting it buys little for an offline app.
  build: { chunkSizeWarningLimit: 800 },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      pwaAssets: {
        image: 'public/favicon.svg',
        preset: 'minimal-2023',
        overrideManifestIcons: true,
        includeHtmlHeadLinks: true,
        injectThemeColor: false,
      },
      manifest: {
        name: 'FOCUS',
        short_name: 'FOCUS',
        description: 'Your One Thing, projects and daily rituals in one trusted place.',
        theme_color: '#f6f5f1',
        background_color: '#f6f5f1',
        display: 'standalone',
        lang: 'en',
      },
      workbox: {
        // The plugin adds manifest.webmanifest itself. Listing it here too creates a conflicting
        // precache entry, and Workbox then refuses to install, so the app wouldn't work offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
