import { createHash } from 'node:crypto'

const root = 'dist/client'
const paths = Array.from(new Bun.Glob('**/*').scanSync({ cwd: root, onlyFiles: true }))
  .filter((path) => path !== 'sw.js')
  .sort()
const hash = createHash('sha256')
for (const path of paths)
  hash.update(new Uint8Array(await Bun.file(`${root}/${path}`).arrayBuffer()))
const result = await Bun.build({
  entrypoints: ['worker/sw.ts'],
  target: 'browser',
  minify: true,
  define: {
    __CACHE_NAME__: JSON.stringify(`slowroads-${hash.digest('hex').slice(0, 12)}`),
    __ASSET_URLS__: JSON.stringify(paths.map((path) => `/${path}`)),
  },
})
if (!result.success) throw new AggregateError(result.logs, 'Offline worker build failed')
const output = result.outputs[0]
if (!output) throw new Error('Offline worker build produced no output')
await Bun.write(`${root}/sw.js`, output)
console.log(`Offline cache prepared: ${paths.length} files`)
