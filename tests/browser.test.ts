import { expect, test } from 'bun:test'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { z } from 'zod'

const captureSchema = z.object({
  normalized_result: z.object({
    steps: z.array(
      z.object({
        step_id: z.string(),
        status: z.string(),
        error: z.string().nullable(),
        artifacts: z.object({
          screenshot: z.object({
            state: z.string(),
            value: z.object({ data_base64: z.string() }).optional(),
          }),
        }),
      }),
    ),
    events: z.object({
      items: z.array(
        z.object({
          kind: z.string(),
          level: z.string().optional(),
          text: z.string().optional(),
          message: z.string().optional(),
        }),
      ),
    }),
  }),
})
const click = (step_id: string, selector: string) => ({
  step_id,
  action: 'click',
  locator: { kind: 'css', selector },
  timeout_ms: 30000,
})
const wait = (step_id: string, selector: string) => ({
  step_id,
  action: 'wait_for',
  locator: { kind: 'css', selector },
  state: 'visible',
  timeout_ms: 20000,
})
const settle = { step_id: 'render', action: 'wait_for_timeout', duration_ms: 1800 }
const start = click('start', '.intro .text-button')

async function capture(actions: object[] | ((origin: string) => object[]), screenshot = false) {
  const executable =
    process.env.BROWSER_EXECUTABLE ??
    (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : Bun.which('google-chrome'))
  if (!executable || !(await Bun.file(executable).exists()))
    throw new Error('A Chrome executable is required. Set BROWSER_EXECUTABLE to its absolute path.')
  const assets = new Map<string, Bun.BunFile>()
  for (const path of new Bun.Glob('**/*').scanSync({ cwd: 'dist/client', onlyFiles: true }))
    assets.set(`/${path}`, Bun.file(`dist/client/${path}`))
  let originStopped = false
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
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
      return file
        ? new Response(file, { headers: { 'cache-control': 'no-store' } })
        : new Response('Not found', { status: 404 })
    },
  })
  const directory = await mkdtemp(join(tmpdir(), 'slowroads-browser-'))
  const input = join(directory, 'scenario.json')
  let launcher = executable
  if (process.platform === 'linux') {
    launcher = join(directory, 'chrome')
    const quoted = `'${executable.replaceAll("'", "'\\''")}'`
    await Bun.write(
      launcher,
      `#!/bin/sh\nexec ${quoted} --use-angle=swiftshader --enable-unsafe-swiftshader "$@"\n`,
    )
    await chmod(launcher, 0o700)
  }
  try {
    await Bun.write(
      input,
      JSON.stringify({
        browser: { mode: 'launch', executable_path: launcher },
        start_url: { url: `http://127.0.0.1:${server.port}/` },
        environment: { service_workers: 'allow' },
        actions:
          typeof actions === 'function' ? actions(`http://127.0.0.1:${server.port}`) : actions,
        capture: {
          at_end: screenshot ? ['screenshot', 'url'] : ['url'],
          events: ['page-errors', 'console'],
        },
      }),
    )
    const child = Bun.spawn(
      ['bunx', '--bun', 'rea-agents@6.8.0', 'capture-browser-scenario', input, '--format', 'json'],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const timeout = setTimeout(() => child.kill(), 140000)
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]).finally(() => clearTimeout(timeout))
    if (code !== 0)
      throw new Error(
        `Browser capture failed (${code}): ${stderr.slice(0, 1200)} ${stdout.slice(0, 1200)}`,
      )
    const result = captureSchema.parse(JSON.parse(stdout)).normalized_result
    const failed = result.steps.filter((step) => step.status !== 'completed')
    const errors = result.events.items.filter(
      (event) =>
        event.kind.startsWith('page-error') ||
        (event.kind === 'console' && event.level === 'error'),
    )
    expect([
      ...failed.map((step) => `${step.step_id}: ${step.error}`),
      ...errors.map((event) => event.text ?? event.message ?? event.kind),
    ]).toEqual([])
    return { result, originStopped }
  } finally {
    server.stop(true)
    await rm(directory, { recursive: true, force: true })
  }
}

test('renders the road in bonnet view without shader or page errors', async () => {
  const { result } = await capture(
    [
      start,
      wait('driving', '.auto-button.enabled'),
      {
        step_id: 'keyboard-autodrive',
        action: 'press',
        locator: { kind: 'css', selector: '.auto-button' },
        key: 'Space',
        timeout_ms: 10000,
      },
      wait('manual', '.auto-button:not(.enabled)'),
      {
        step_id: 'bonnet',
        action: 'press',
        locator: { kind: 'css', selector: 'body' },
        key: 'c',
        timeout_ms: 10000,
      },
      wait('bonnet-selected', '[aria-label="Change camera (bonnet)"]'),
      settle,
    ],
    true,
  )
  const screenshot = result.steps.at(-1)?.artifacts.screenshot.value?.data_base64
  if (!screenshot) throw new Error('Camera capture did not return an image')
  const bitmap = PNG.sync.read(Buffer.from(screenshot, 'base64'))
  let roadPixels = 0,
    pixels = 0
  for (let y = Math.floor(bitmap.height * 0.42); y < bitmap.height * 0.78; y++) {
    for (let x = Math.floor(bitmap.width * 0.28); x < bitmap.width * 0.72; x++) {
      const offset = (y * bitmap.width + x) * 4
      const r = bitmap.data[offset] ?? 0,
        g = bitmap.data[offset + 1] ?? 0,
        b = bitmap.data[offset + 2] ?? 0
      const brightness = (r + g + b) / 3
      if (brightness > 60 && brightness < 180 && Math.max(r, g, b) - Math.min(r, g, b) < 30)
        roadPixels++
      pixels++
    }
  }
  expect(roadPixels / pixels).toBeGreaterThan(0.2)
}, 150000)

test('rebuilds seasonal scenery and vehicles without renderer errors', async () => {
  await capture([
    start,
    wait('driving', '.drive.is-driving'),
    click('settings', '[aria-label="Open settings"]'),
    click('winter', '.option-row button:has-text("Winter")'),
    click('night', '.option-row button:has-text("Night")'),
    click('vehicle-tab', '[role="tab"]:has-text("vehicle")'),
    click('coach', '.vehicle-options button:has-text("Wanderer bus")'),
    click('motorcycle', '.vehicle-options button:has-text("Motorcycle")'),
    click('touring', '.vehicle-options button:has-text("Grand tourer")'),
    click('close-settings', '[aria-label="Close settings"]'),
    settle,
  ])
}, 150000)

test('reloads and drives after the HTTP origin shuts down', async () => {
  const { originStopped } = await capture((origin) => [
    wait('cached', '.offline-status:has-text("Offline ready")'),
    {
      step_id: 'disconnect',
      action: 'goto',
      destination: { url: `${origin}/__disconnect` },
      wait_until: 'load',
      timeout_ms: 30000,
    },
    wait('reloaded', '.intro .text-button'),
    start,
    wait('driving-offline', '.auto-button.enabled'),
    settle,
  ])
  expect(originStopped).toBe(true)
}, 150000)
