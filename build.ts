import { readFile, readdir, writeFile, rm } from 'fs/promises'
import { build } from 'tsup'

async function buildNodes() {
  const nodes = await readdir('./src/nodes')
  const entry: string[] = []
  for (const node of nodes)
    entry.push(`./src/nodes/${node}/index.ts`, `./src/nodes/${node}/editor.ts`)

  await build({
    entry,
    splitting: false,
    sourcemap: false,
    clean: true,
    format: ['cjs'],
    target: 'node20',
    publicDir: 'public',
    outDir: 'build'
  })

  for (const node of nodes) {
    const [html, editor, main] = await Promise.all([
      readFile(`./src/nodes/${node}/editor.html`, 'utf8'),
      readFile(`./build/${node}/editor.js`, 'utf8'),
      readFile(`./build/${node}/index.js`, 'utf8')
    ])
    await writeFile(
      `./build/${node}.html`,
      `<script type="text/javascript">${editor}</script>${html}`,
      'utf8'
    )
    await writeFile(`./build/${node}.js`, main, 'utf8')
    await rm(`./build/${node}`, {
      recursive: true,
      force: true
    })
  }

  process.exit(0)
}


buildNodes()
