import { defineConfig } from 'vite-plus'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// CesiumJS loads workers, widgets and imagery assets at runtime from
// CESIUM_BASE_URL, so they are copied verbatim next to the bundle.
const cesiumSource = 'node_modules/cesium/Build/Cesium'
const cesiumBaseUrl = 'cesium'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      // stripBase drops `node_modules/cesium/Build/Cesium/` from the copied paths.
      targets: ['ThirdParty', 'Workers', 'Assets', 'Widgets'].map((dir) => ({
        src: `${cesiumSource}/${dir}`,
        dest: cesiumBaseUrl,
        rename: { stripBase: 4 },
      })),
    }),
  ],
  define: {
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`),
  },
  worker: {
    format: 'es',
  },
  build: {
    // Cesium alone is ~4 MB; it and Chart.js are already split off by the
    // lazy imports of the globe and chart views.
    chunkSizeWarningLimit: 6000,
  },

  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },

  lint: {
    ignorePatterns: ['dist/**', 'src/wasm/**'],
    plugins: ['typescript', 'react', 'oxc', 'unicorn', 'import'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      'react/rules-of-hooks': 'error',
      'react/exhaustive-deps': 'warn',
      'react/react-in-jsx-scope': 'off',
    },
  },

  fmt: {
    ignorePatterns: ['dist/**', 'src/wasm/**', 'bun.lock'],
    singleQuote: true,
    semi: false,
    printWidth: 140,
    trailingComma: 'all',
  },
})
