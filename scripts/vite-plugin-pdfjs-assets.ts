import { readFileSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { Plugin } from 'vite'

/**
 * pdf.js loads a few files at run time, only when a PDF needs them: decoders for scanned images
 * (JBIG2, JPEG 2000; wasm with JavaScript fallbacks), colour management, the standard PDF fonts and
 * colour profiles. This plugin serves them from our own site under `<base>pdfjs/` (in dev and in
 * the build), so importing a site plan never contacts a CDN.
 */
export const PDFJS_ASSETS_DIR = 'pdfjs'

const SOURCE = 'node_modules/pdfjs-dist'
/** Folders to copy, with the files to leave out (quickjs is for PDF scripting, which is off). */
const FOLDERS: Record<string, RegExp | null> = {
  wasm: /^quickjs/,
  standard_fonts: null,
  iccs: null,
}
const CONTENT_TYPES: Record<string, string> = {
  '.wasm': 'application/wasm',
  '.js': 'text/javascript',
}

type AssetFile = { path: string; source: string }

function assetFiles(root: string): AssetFile[] {
  return Object.entries(FOLDERS).flatMap(([folder, exclude]) =>
    readdirSync(join(root, SOURCE, folder))
      .filter((name) => !exclude?.test(name))
      .map((name) => ({
        path: `${PDFJS_ASSETS_DIR}/${folder}/${name}`,
        source: join(root, SOURCE, folder, name),
      })),
  )
}

export function pdfjsAssets(): Plugin {
  let root = process.cwd()
  return {
    name: 'garden:pdfjs-assets',
    configResolved(config) {
      root = config.root
    },
    configureServer(server) {
      const base = server.config.base
      const files = new Map(assetFiles(root).map((file) => [base + file.path, file.source]))
      server.middlewares.use((req, res, next) => {
        const source = files.get((req.url ?? '').split('?')[0]!)
        if (!source) return next()
        res.setHeader('Content-Type', CONTENT_TYPES[extname(source)] ?? 'application/octet-stream')
        res.end(readFileSync(source))
      })
    },
    generateBundle() {
      for (const file of assetFiles(root)) {
        this.emitFile({ type: 'asset', fileName: file.path, source: readFileSync(file.source) })
      }
    },
  }
}
