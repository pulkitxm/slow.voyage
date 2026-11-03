import { controllerFixture } from './controller-fixture'
import { mappingFixture } from './mapping-fixture'

export function productionFixture(controller: 'standard' | 'custom' | false = false) {
  const assets = new Map<string, Bun.BunFile>()
  for (const path of new Bun.Glob('**/*').scanSync({ cwd: 'dist/client', onlyFiles: true }))
    assets.set(`/${path}`, Bun.file(`dist/client/${path}`))
  let originStopped = false
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname
      if (path === '/__disconnect') {
        setTimeout(() => {
          originStopped = true
          server.stop(true)
        }, 100)
        return new Response(
          '<!doctype html><html><head><link rel="icon" href="/icon.svg"><meta http-equiv="refresh" content="1;url=/"></head><body>Origin disconnected</body></html>',
          { headers: { 'content-type': 'text/html' } },
        )
      }
      const file = assets.get(path === '/' ? '/index.html' : path)
      if (!file) return new Response('Not found', { status: 404 })
      const body =
        controller && (path === '/' || path === '/index.html')
          ? (await file.text()).replace(
              '<head>',
              `<head><script>${controller === 'custom' ? mappingFixture : controllerFixture}</script>`,
            )
          : file
      return new Response(body, {
        headers: { 'cache-control': 'no-store', 'content-type': file.type },
      })
    },
  })
  return {
    url: `http://127.0.0.1:${server.port}/`,
    get originStopped() {
      return originStopped
    },
    stop: () => server.stop(true),
  }
}
