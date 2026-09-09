import { cp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { defineConfig, type UserConfig } from 'tsdown'

const OUT_DIR = 'build'

// Every folder in src/nodes is one Node-RED node: a runtime half (index.ts)
// loaded by the Node-RED server, and an editor half (editor.ts + editor.html)
// that runs in the browser. Node-RED expects them as build/<node>.js and
// build/<node>.html, the html carrying the editor script inline.
const entries = await readdir('src/nodes', { withFileTypes: true })
const nodes = entries
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort()

// The registry loads each node file on its own, so every one is built as its
// own bundle: no chunk shared between nodes, nothing to resolve beside them.
const runtime = (node: string, first: boolean): UserConfig => ({
  entry: { [node]: `src/nodes/${node}/index.ts` },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outDir: OUT_DIR,
  treeshake: true,
  dts: false,
  fixedExtension: false,
  hooks: first
    ? {
        // Icons and other editor resources are served from the node's own
        // directory. Copied once, by the first config, as they all share it.
        async 'build:done'({ options }) {
          await cp('public', options.outDir, { recursive: true })
        }
      }
    : {}
})

// An inline <script> cannot use ESM imports, so each editor script is bundled
// standalone as an IIFE and embedded into its edit dialog.
const editor = (node: string): UserConfig => ({
  entry: { [`${node}.editor`]: `src/nodes/${node}/editor.ts` },
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  outDir: OUT_DIR,
  dts: false,
  fixedExtension: false,
  outputOptions: { entryFileNames: `${node}.editor.js` },
  hooks: {
    async 'build:done'({ options }) {
      const script = `${options.outDir}/${node}.editor.js`
      const [html, editorScript] = await Promise.all([
        readFile(`src/nodes/${node}/editor.html`, 'utf-8'),
        readFile(script, 'utf-8')
      ])
      await writeFile(
        `${options.outDir}/${node}.html`,
        `<script type="text/javascript">\n${editorScript}</script>\n\n${html}`,
        'utf-8'
      )
      await rm(script)
    }
  }
})

export default defineConfig(
  nodes.flatMap((node, index) => [runtime(node, index === 0), editor(node)])
)
