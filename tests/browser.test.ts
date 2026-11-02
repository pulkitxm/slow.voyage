import { expect, test } from 'bun:test'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { z } from 'zod'
import { controllerFixture } from './controller-fixture'

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
const press = (step_id: string, key: string, selector = 'body') => ({
  step_id,
  action: 'press',
  locator: { kind: 'css', selector },
  key,
  timeout_ms: 20000,
})

async function capture(
  actions: object[] | ((origin: string) => object[]),
  screenshot = false,
  controller = false,
) {
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
          ? (await file.text()).replace('<head>', `<head><script>${controllerFixture}</script>`)
          : file
      return new Response(body, {
        headers: { 'cache-control': 'no-store', 'content-type': file.type },
      })
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

test('rebuilds landscapes, seasons, and vehicles without renderer errors', async () => {
  await capture([
    start,
    wait('driving', '.drive.is-driving'),
    click('settings', '[aria-label="Open settings"]'),
    click('alpine', '.landscape-option:has-text("Alpine Pass")'),
    click('desert', '.landscape-option:has-text("Desert Highway")'),
    click('highlands', '.landscape-option:has-text("The Highlands")'),
    click('winter', '.option-row button:has-text("Winter")'),
    click('night', '.option-row button:has-text("Night")'),
    click('vehicle-tab', '[role="tab"]:has-text("vehicle")'),
    {
      step_id: 'minimum-grip',
      action: 'press',
      locator: { kind: 'css', selector: '#grip' },
      key: 'Home',
      timeout_ms: 10000,
    },
    wait('minimum-grip-shown', 'label[for="grip"] span:has-text("0.2")'),
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

test('hands assisted axes to the driver and configures one-pedal and cruise controls', async () => {
  await capture([
    start,
    wait('full', '[data-assistance="full"]'),
    press('take-steering', 'a'),
    wait('speed-only', '[data-assistance="speed"]'),
    press('take-pedals', 'w'),
    wait('manual', '[data-assistance="off"]'),
    press('select-steering', 'g'),
    press('enable-steering', 'f'),
    wait('steering-only', '[data-assistance="steer"]'),
    press('pedals-remain-manual', 'w'),
    wait('still-steering', '[data-assistance="steer"]'),
    press('take-all', 'd'),
    wait('all-manual', '[data-assistance="off"]'),
    click('settings', '[aria-label="Open settings"]'),
    click('controls', '[role="tab"]:has-text("controls")'),
    click('one-pedal', '.check-option:has-text("One-pedal") input'),
    wait('one-pedal-enabled', '.check-option:has-text("One-pedal") input:checked'),
    press('minimum-cruise', 'Home', '#cruise-speed'),
    wait('cruise-updated', 'label[for="cruise-speed"] span:has-text("18 km/h")'),
    click('choose-speed', '.segmented button:has-text("Autospeed")'),
    click('close', '[aria-label="Close settings"]'),
    press('enable-speed', 'f'),
    wait('speed-active', '[data-assistance="speed"]'),
    settle,
  ])
}, 150000)

test('polls a simulated browser gamepad for driving, buttons, and disconnects', async () => {
  await capture(
    [
      start,
      wait('controller-connected', '[data-controller="connected"]'),
      wait('autodrive', '[data-assistance="full"]'),
      press('trigger', '1'),
      wait('pedals-taken', '[data-assistance="steer"]'),
      press('release', '0'),
      press('stick', '2'),
      wait('steering-taken', '[data-assistance="off"]'),
      press('release-stick', '0'),
      press('toggle-auto', '3'),
      wait('auto-button', '[data-assistance="full"]'),
      press('release-auto', '0'),
      press('camera-button', '4'),
      wait('camera-changed', '[aria-label="Change camera (bonnet)"]'),
      press('release-camera', '0'),
      press('pause-button', '7'),
      wait('paused', '[aria-label="Resume driving"]'),
      press('release-pause', '0'),
      wait('release-observed', 'html[data-fixture-pad-neutral="yes"]'),
      press('resume-button', '7'),
      wait('resumed', '[aria-label="Pause driving"]'),
      press('release-resume', '0'),
      press('disconnect', '5'),
      wait('controller-gone', '[data-controller="none"]'),
      press('reconnect', '6'),
      wait('controller-back', '[data-controller="connected"]'),
      press('unmapped', '8'),
      wait('mapping-unavailable', '[data-controller="unsupported"]'),
      settle,
    ],
    false,
    true,
  )
}, 150000)

test('mouse driving takes over assisted axes and overrides controller input', async () => {
  await capture(
    [
      start,
      wait('autodrive', '[data-assistance="full"]'),
      press('enable-mouse', 'm'),
      wait('mouse-enabled', '[data-mouse-steer="0.00"]'),
      press('controller-trigger', '1'),
      { step_id: 'controller-sampled', action: 'wait_for_timeout', duration_ms: 400 },
      wait('mouse-priority', '[data-assistance="full"]'),
      { ...click('mouse-brake', 'canvas'), button: 'right' },
      wait('mouse-takes-pedals', '[data-assistance="steer"]'),
      press('mouse-move', '9'),
      wait('mouse-takes-steering', '[data-assistance="off"]'),
      wait('steering-visible', '[data-mouse-steer="1.00"]'),
      click('mouse-accelerate', 'canvas'),
      wait('recentered', '[data-mouse-steer="0.00"]'),
      click('settings', '[aria-label="Open settings"]'),
      click('controls', '[role="tab"]:has-text("controls")'),
      wait('mouse-preference', '.check-option:has-text("Mouse driving") input:checked'),
      press('mouse-sensitivity', 'End', '#mouse-sensitivity'),
      wait('sensitivity-updated', 'label[for="mouse-sensitivity"] span:has-text("2.0")'),
      click('close', '[aria-label="Close settings"]'),
      press('disable-mouse', 'm'),
      press('re-enable-auto', 'f'),
      wait('autodrive-restored', '[data-assistance="full"]'),
      press('release-controller', '0'),
      wait('controller-released', 'html[data-fixture-pad-neutral="yes"]'),
      press('controller-active', '1'),
      wait('controller-priority-restored', '[data-assistance="steer"]'),
      settle,
    ],
    false,
    true,
  )
}, 150000)
