import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { z } from 'zod'
import { browserExecutable } from '../scripts/browser'
import { productionFixture } from './fixture'

const captureTimeout = 210000
const testTimeout = captureTimeout + 10000

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
  controller: boolean | 'custom' = false,
) {
  const executable = browserExecutable()
  const fixture = productionFixture(
    controller === 'custom' ? 'custom' : controller ? 'standard' : false,
  )
  const directory = await mkdtemp(join(tmpdir(), 'slowroads-browser-'))
  const input = join(directory, 'scenario.json')
  try {
    await Bun.write(
      input,
      JSON.stringify({
        browser: { mode: 'launch', executable_path: executable },
        start_url: { url: fixture.url },
        environment: { service_workers: 'allow' },
        actions: typeof actions === 'function' ? actions(fixture.url.slice(0, -1)) : actions,
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
    const timeout = setTimeout(() => child.kill(), captureTimeout)
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
    return { result, originStopped: fixture.originStopped }
  } finally {
    await fixture.stop()
    await rm(directory, { recursive: true, force: true })
  }
}

test(
  'renders the road in bonnet view without shader or page errors',
  async () => {
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
  },
  testTimeout,
)

test(
  'rebuilds landscapes, weather, seasons, and vehicles without renderer errors',
  async () => {
    await capture([
      start,
      wait('driving', '.drive.is-driving'),
      click('settings', '[aria-label="Open settings"]'),
      click('alpine', '.landscape-option:has-text("Alpine Pass")'),
      click('desert', '.landscape-option:has-text("Desert Highway")'),
      click('highlands', '.landscape-option:has-text("The Highlands")'),
      click('rain', '.weather-options button:has-text("Rain")'),
      wait('rain-active', '[data-weather="rain"]'),
      click('fog', '.weather-options button:has-text("Fog")'),
      wait('fog-active', '[data-weather="fog"]'),
      click('winter', '.option-row button:has-text("Winter")'),
      click('snow', '.weather-options button:has-text("Snow")'),
      wait('snow-active', '[data-weather="rain"][data-season="winter"]'),
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
  },
  testTimeout,
)

test(
  'reloads and drives after the HTTP origin shuts down',
  async () => {
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
  },
  testTimeout,
)

test(
  'hands assisted axes to the driver and configures one-pedal and cruise controls',
  async () => {
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
      wait('cruise-updated', 'label[for="cruise-speed"] span:has-text("1 km/h")'),
      click('reverse', '.setting-section button:text-is("Reverse")'),
      press('reverse-limit', 'End', '#cruise-speed'),
      wait('reverse-selected', 'label[for="cruise-speed"] span:has-text("R · 18 km/h")'),
      click('cruise-stop', '.setting-section button:text-is("Stop")'),
      wait('cruise-held', '#cruise-speed:disabled'),
      click('forward', '.setting-section button:text-is("Forward")'),
      click('choose-speed', '.segmented button:has-text("Autospeed")'),
      click('close', '[aria-label="Close settings"]'),
      press('enable-speed', 'f'),
      wait('speed-active', '[data-assistance="speed"]'),
      settle,
    ])
  },
  testTimeout,
)

test(
  'keeps driving free of decorative overlays and switches scenery and cars with shortcuts',
  async () => {
    await capture([
      start,
      wait(
        'clean-driving-view',
        '.is-driving:not(:has(.brand, .location, .drive-indicator, .bottom-line, .offline-status))',
      ),
      press('next-scenery', 'e'),
      wait(
        'autumn-evening',
        '[data-landscape="highlands"][data-season="autumn"][data-daylight="sunset"]',
      ),
      press('previous-scenery', 'q'),
      wait(
        'summer-hills',
        '[data-landscape="highlands"][data-season="summer"][data-daylight="day"]',
      ),
      press('wrap-scenery', 'q'),
      wait(
        'alpine-night',
        '[data-landscape="alpine"][data-season="winter"][data-daylight="night"]',
      ),
      wait('still-moving', '.speed-value:not(:text-is("00"))'),
      press('next-vehicle', 'v'),
      wait('roadster', '[data-vehicle="roadster"]'),
      press('previous-vehicle', 'Shift+V'),
      wait('touring', '[data-vehicle="touring"]'),
      click('settings-available', '[aria-label="Open settings"]'),
      click('vehicle-tab', '[role="tab"]:has-text("vehicle")'),
      wait('selected-vehicle', '.vehicle-options button.selected:has-text("Grand tourer")'),
      click('close', '[aria-label="Close settings"]'),
      settle,
    ])
  },
  testTimeout,
)

test(
  'polls a simulated browser gamepad for driving, buttons, and disconnects',
  async () => {
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
  },
  testTimeout,
)

test(
  'mouse driving takes over assisted axes and overrides controller input',
  async () => {
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
  },
  testTimeout,
)

const calibrateController = (name: string, key: string, id: string) => [
  click(`${id}-choose`, `[aria-label="Bind ${name}"]`),
  click(`${id}-ready`, '.mapping-capture button:text-is("Ready")'),
  press(`${id}-move`, key),
  wait(`${id}-detected`, '.mapping-capture > small:first-of-type'),
  press(`${id}-release`, '0'),
  wait(`${id}-released`, `[aria-label="Save ${name} binding"]:enabled`),
  click(`${id}-save`, `[aria-label="Save ${name} binding"]`),
]

test(
  'calibrates unmapped wheel and pedal controls and keeps camera input separate',
  async () => {
    await capture(
      [
        start,
        click('mapping-settings', '[aria-label="Open settings"]'),
        click('mapping-controls', '[role="tab"]:text-is("controls")'),
        click('custom-layout', '.controller-mapping button:text-is("custom")'),
        ...calibrateController('Steer left', '1', 'wheel'),
        ...calibrateController('Accelerate', '3', 'pedal'),
        click('mapping-close', '[aria-label="Close settings"]'),
        press('mapped-pedal', '3'),
        wait('mapped-speed-takeover', '[data-assistance="steer"]'),
        press('mapped-neutral', '0'),
        press('mapped-wheel', '1'),
        wait('mapped-steering-takeover', '[data-assistance="off"]'),
        press('mapped-wheel-neutral', '0'),
        click('camera-settings', '[aria-label="Open settings"]'),
        click('camera-bindings', '.mapping-group > summary:text-is("Camera")'),
        ...calibrateController('Look left', '6', 'look'),
        click('camera-close', '[aria-label="Close settings"]'),
        press('restore-assistance', 'f'),
        wait('restored-full', '[data-assistance="full"]'),
        press('mapped-bonnet', 'c'),
        wait('mapped-bonnet-active', '[data-camera="bonnet"]'),
        press('mapped-look', '6'),
        wait('look-keeps-assistance', '[data-assistance="full"]'),
        settle,
      ],
      true,
      'custom',
    )
  },
  testTimeout,
)
