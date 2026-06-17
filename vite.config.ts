import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Library build: one ESM bundle, React and Motion left external (peer deps), unminified so the
// published source stays readable and the consumer's bundler does the minifying. Types are emitted
// separately by `tsc -p tsconfig.build.json` (see the build script).
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'feral-blob.js',
    },
    rollupOptions: {
      external: [/^react($|\/)/, /^react-dom($|\/)/, /^motion($|\/)/],
    },
    sourcemap: true,
    minify: false,
  },
})
