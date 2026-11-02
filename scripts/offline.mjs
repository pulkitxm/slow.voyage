import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const root = 'dist/client'
async function files(path) {
  const entries = await readdir(path, { withFileTypes: true })
  return (
    await Promise.all(
      entries.map((e) => (e.isDirectory() ? files(join(path, e.name)) : join(path, e.name))),
    )
  ).flat()
}
const paths = (await files(root)).filter((p) => !p.endsWith('sw.js'))
const hash = createHash('sha256')
for (const path of paths) hash.update(await readFile(path))
const cache = `slowroads-${hash.digest('hex').slice(0, 12)}`
const urls = paths.map((p) => `/${relative(root, p)}`)
await writeFile(
  join(root, 'sw.js'),
  `const CACHE=${JSON.stringify(cache)};const FILES=${JSON.stringify(urls)};self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()))});self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('slowroads-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).catch(()=>event.request.mode==='navigate'?caches.match('/index.html'):Response.error()))))});`,
)
console.log(`Offline cache prepared: ${urls.length} files`)
