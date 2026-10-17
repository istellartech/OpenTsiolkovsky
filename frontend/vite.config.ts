import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// CesiumJS loads workers, widgets and imagery assets at runtime from
// CESIUM_BASE_URL, so they are copied verbatim next to the bundle.
const cesiumSource = 'node_modules/cesium/Build/Cesium'
const cesiumBaseUrl = 'cesium'

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/ThirdParty`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Workers`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Assets`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Widgets`, dest: cesiumBaseUrl },
      ],
    }),
  ],
  define: {
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`),
  },
  worker: {
    format: 'es',
  },
  build: {
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        manualChunks: {
          chartjs: ['chart.js'],
          cesium: ['cesium'],
        },
      },
    },
  },
})
