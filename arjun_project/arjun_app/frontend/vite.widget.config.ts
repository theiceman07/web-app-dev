import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import fs from 'fs'

// Builds src/widget.tsx into stable file names (widget.js, widget.css) that the
// Django templates load on every page, and copies them next to the main bundle.
export default defineConfig({
  base: '/static/',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    react(),
    {
      name: 'copy-widget',
      closeBundle() {
        const out = path.resolve(import.meta.dirname, 'dist-widget')
        const targets = [
          path.resolve(import.meta.dirname, '../statics/assets'),
          path.resolve(import.meta.dirname, '../../../public/static/assets'),
        ]
        for (const dest of targets) {
          fs.mkdirSync(dest, { recursive: true })
          for (const file of ['widget.js', 'widget.css']) {
            fs.copyFileSync(path.join(out, file), path.join(dest, file))
          }
        }
        console.log('✓ Copied widget.js and widget.css to statics/assets and public/static/assets')
      },
    },
  ],
  build: {
    outDir: 'dist-widget',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(import.meta.dirname, 'src/widget.tsx'),
      formats: ['es'],
      fileName: () => 'widget.js',
      cssFileName: 'widget',
    },
  },
})
