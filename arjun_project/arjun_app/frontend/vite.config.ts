import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import fs from 'fs'

// https://vite.dev/config/
export default defineConfig({
  base: '/static/',
  plugins: [
    react(),
    {
      name: 'copy-to-django',
      closeBundle() {
        const distDir = path.resolve(import.meta.dirname, 'dist')
        const templateDir = path.resolve(import.meta.dirname, '../template')
        const staticsDir = path.resolve(import.meta.dirname, '../statics')

        if (fs.existsSync(distDir)) {
          // Copy index.html to ../template/index.html
          const htmlSrc = path.join(distDir, 'index.html')
          if (fs.existsSync(htmlSrc)) {
            if (!fs.existsSync(templateDir)) {
              fs.mkdirSync(templateDir, { recursive: true })
            }
            fs.copyFileSync(htmlSrc, path.join(templateDir, 'index.html'))
            console.log('✓ Copied index.html to arjun_app/template/index.html')
          }

          // Copy assets to ../statics/assets (served by Django locally) and to
          // <repo>/public/static/assets (served by Vercel). Old hashed files are
          // removed first so stale bundles never ship.
          const assetsSrc = path.join(distDir, 'assets')
          if (fs.existsSync(assetsSrc)) {
            const publicStatic = path.resolve(import.meta.dirname, '../../../public/static')
            for (const root of [staticsDir, publicStatic]) {
              const destAssets = path.join(root, 'assets')
              fs.mkdirSync(destAssets, { recursive: true })
              // Remove only old hashed app bundles; widget.js/widget.css come from the widget build.
              for (const old of fs.readdirSync(destAssets)) {
                if (/^index-.*\.(js|css)$/.test(old)) fs.rmSync(path.join(destAssets, old))
              }
              fs.cpSync(assetsSrc, destAssets, { recursive: true })
            }
            console.log('✓ Copied assets to arjun_app/statics/assets and public/static/assets')
          }
        }
      },
    },
  ],
})
