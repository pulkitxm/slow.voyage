import { createHash } from 'node:crypto'

const root = 'dist/client'
const paths = Array.from(new Bun.Glob('**/*').scanSync({ cwd: root, onlyFiles: true }))
  .filter((path) => path !== 'sw.js')
  .sort()
const sources = (folder: string, extension: string) =>
  Array.from(
    new Bun.Glob(`*.${extension}`).scanSync({
      cwd: `src/assets/models/cars/${folder}`,
      onlyFiles: true,
    }),
  ).map((file) => file.slice(0, -extension.length - 1))
const bodies = sources('bodies', 'glb')
const pictures = sources('thumbs', 'webp').filter((name) => !name.endsWith('-mask'))
const builtFrom = (path: string, id: string, pattern: RegExp) =>
  path.startsWith(`assets/${id}-`) && pattern.test(path.slice(8 + id.length))
const lazy = paths.filter(
  (path) =>
    bodies.some((id) => builtFrom(path, id, /^[A-Za-z0-9_-]+\.glb$/)) ||
    pictures.some((id) => builtFrom(path, id, /^(mask-)?[A-Za-z0-9_-]+\.webp$/)),
)
const eager = paths.filter((path) => !lazy.includes(path))
const hash = createHash('sha256')
for (const path of paths)
  hash.update(new Uint8Array(await Bun.file(`${root}/${path}`).arrayBuffer()))
const result = await Bun.build({
  entrypoints: ['worker/sw.ts'],
  target: 'browser',
  minify: true,
  define: {
    __CACHE_NAME__: JSON.stringify(`slow-voyage-${hash.digest('hex').slice(0, 12)}`),
    __ASSET_URLS__: JSON.stringify(eager.map((path) => `/${path}`)),
    __LAZY_URLS__: JSON.stringify(lazy.map((path) => `/${path}`)),
  },
})
if (!result.success) throw new AggregateError(result.logs, 'Offline worker build failed')
const output = result.outputs[0]
if (!output) throw new Error('Offline worker build produced no output')
await Bun.write(`${root}/sw.js`, output)
console.log(`Offline cache prepared: ${eager.length} files, ${lazy.length} cached on first use`)
