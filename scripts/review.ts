import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'
import { browserExecutable } from './browser'

const resultSchema = z.object({
  normalized_result: z.object({
    steps: z.array(
      z.object({
        step_id: z.string(),
        status: z.string(),
        error: z.string().nullable(),
        artifacts: z.object({
          screenshot: z.object({ value: z.object({ data_base64: z.string() }).optional() }),
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
const label = process.argv[2] ?? new Date().toISOString().replaceAll(/[:.]/g, '-')
if (!/^[a-zA-Z0-9_-]+$/.test(label))
  throw new Error('Use letters, digits, hyphens, and underscores for the capture label.')
const directory = resolve('.review', label)
if (await Bun.file(`${directory}/index.html`).exists())
  throw new Error(
    'This capture label already exists. Choose another to preserve the previous comparison.',
  )
await mkdir(directory, { recursive: true })
const executable = browserExecutable()
async function readGit(args: string[]) {
  const process = Bun.spawn(['git', ...args], { stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  if (code !== 0) throw new Error(stderr)
  return stdout.trim()
}
const [revision, workingTree] = await Promise.all([
  readGit(['rev-parse', 'HEAD']),
  readGit(['status', '--porcelain']),
])
const press = (step_id: string, selector: string, key: string) => ({
  step_id,
  action: 'press',
  locator: { kind: 'css', selector },
  key,
  timeout_ms: 30000,
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
  timeout_ms: 30000,
})
const pause = (step_id: string, duration_ms: number) => ({
  step_id,
  action: 'wait_for_timeout',
  duration_ms,
})
const sources = [
  {
    id: 'local',
    name: 'Local reconstruction',
    url: 'http://localhost:3002/',
    actions: [click('start', '.intro .text-button'), wait('autodrive', '[data-assistance="full"]')],
  },
  {
    id: 'reference',
    name: 'Historical reference, v1.0.1',
    url: 'https://slowxroads.com/',
    actions: [
      click('start', '#splash-loader.splash-ready'),
      pause('input-ready', 1000),
      press('enable-autodrive', '#game-main', 'f'),
      wait('autodrive', '#autodrive.autodrive-active'),
    ],
  },
]
const comparisons = await Promise.all(
  sources.map(async (source) => {
    const input = `${directory}/${source.id}-scenario.json`
    await Bun.write(
      input,
      JSON.stringify({
        browser: { mode: 'launch', executable_path: executable },
        start_url: { url: source.url },
        environment: {
          viewport: { width: 1280, height: 720, device_scale_factor: 1 },
          reduced_motion: 'no-preference',
        },
        actions: [...source.actions, pause('six-seconds', 6000), pause('twelve-seconds', 6000)],
        capture: {
          after_each_step: ['screenshot'],
          at_end: ['screenshot', 'dom', 'url'],
          events: ['page-errors', 'console'],
        },
      }),
    )
    const child = Bun.spawn(
      ['bunx', '--bun', 'rea-agents@6.8.0', 'capture-browser-scenario', input, '--format', 'json'],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const timeout = setTimeout(() => child.kill(), 90000)
    try {
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      if (code !== 0) throw new Error(`Capture process exited ${code}: ${stderr.slice(0, 500)}`)
      await Bun.write(`${directory}/${source.id}-capture.json`, stdout)
      const result = resultSchema.parse(JSON.parse(stdout)).normalized_result
      const failures = result.steps
        .filter((step) => step.status !== 'completed')
        .map((step) => `${step.step_id}: ${step.error}`)
      failures.push(
        ...result.events.items
          .filter((event) => event.kind.startsWith('page-error') || event.level === 'error')
          .map((event) => event.text ?? event.message ?? event.kind),
      )
      for (const step of result.steps) {
        const picture = step.artifacts.screenshot.value
        if (picture)
          await Bun.write(
            `${directory}/${source.id}-${step.step_id}.png`,
            Buffer.from(picture.data_base64, 'base64'),
          )
      }
      return { ...source, failures }
    } catch (error) {
      return { ...source, failures: [error instanceof Error ? error.message : String(error)] }
    } finally {
      clearTimeout(timeout)
    }
  }),
)
const metadata = {
  recordedAt: new Date().toISOString(),
  revision,
  dirty: workingTree.length > 0,
  workingTree,
  viewport: { width: 1280, height: 720 },
  sources: comparisons.map(({ id, name, url, failures }) => ({ id, name, url, failures })),
}
await Bun.write(`${directory}/manifest.json`, JSON.stringify(metadata, null, 2))
const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
await Bun.write(
  `${directory}/index.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/icon.svg"><title>Driving comparison ${escapeHtml(label)}</title><style>body{background:#18221d;color:#edf1e8;font:16px system-ui;margin:32px}p{max-width:85ch;line-height:1.6}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}img{width:100%;display:block}figure{margin:20px 0}figcaption{padding:8px 0;color:#b8c7ba}a{color:#cee3b3}code{overflow-wrap:anywhere}.error{color:#ffb5a8}@media(max-width:850px){main{grid-template-columns:1fr}}</style><h1>Driving comparison: ${escapeHtml(label)}</h1><p>Captured at 1280 × 720 with clean browser profiles and autodrive enabled. Routes and seeds differ. The reference is the historical v1.0.1 release, not the current official build. These images support visual review; use measured input and simulation traces for handling claims.</p><p>Local revision: <code>${escapeHtml(revision)}</code>. Working tree: ${workingTree ? 'uncommitted changes were present' : 'clean'}.</p><main>${comparisons.map((source) => `<section><h2>${escapeHtml(source.name)}</h2><a href="${escapeHtml(source.url)}">${escapeHtml(source.url)}</a>${source.failures.length ? `<p class="error">Capture requires inspection: ${escapeHtml(source.failures.join('; '))}</p>` : '<p>All capture steps passed without browser errors.</p>'}${['six-seconds', 'twelve-seconds'].map((step) => `<figure><a href="${source.id}-${step}.png"><img alt="${escapeHtml(source.name)} at ${step.replace('-', ' ')}" src="${source.id}-${step}.png"></a><figcaption>${step.replace('-', ' ')}</figcaption></figure>`).join('')}</section>`).join('')}</main>`,
)
for (const source of comparisons)
  console.log(
    `${source.name}: ${source.failures.length ? source.failures.join('; ') : 'capture passed'}`,
  )
console.log(`Comparison: ${directory}/index.html`)
console.log(`Viewer: http://localhost:3002/__review/${label}/`)
if (comparisons.some((source) => source.failures.length)) process.exitCode = 1
