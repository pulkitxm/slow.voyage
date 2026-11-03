import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, type Page } from 'playwright-core'
import { z } from 'zod'
import { browserExecutable } from './browser'

interface Sample {
  time: number
  speed: number
  steering: number
  assistance: string
  boost: string
}

interface Scenario {
  id: string
  title: string
  vehicle: 'touring' | 'roadster' | 'motorcycle' | 'bus'
  cruiseSpeed: number
  seconds: number
  setup: (page: Page) => Promise<void>
  during?: (page: Page, elapsed: number) => Promise<void>
}

const verdictSchema = z.object({
  verdict: z.enum(['pass', 'fail']),
  scores: z.object({
    stability: z.number(),
    laneKeeping: z.number(),
    visuals: z.number(),
    smoothness: z.number(),
  }),
  issues: z.array(z.string()),
})

const label = process.argv[2] ?? new Date().toISOString().replaceAll(/[:.]/g, '-')
if (!/^[a-zA-Z0-9_-]+$/.test(label))
  throw new Error('Use letters, digits, hyphens, and underscores for the judge label.')
const only = process.argv.slice(3)
const url = process.env.JUDGE_URL ?? 'http://localhost:3002/'
const model = process.env.JUDGE_MODEL ?? 'grok-4.7-build-fast'
const judge = Bun.which('grok')
const ffmpeg = Bun.which('ffmpeg')
if (!ffmpeg) throw new Error('Install ffmpeg to assemble judge clips.')
const root = resolve('.review/judge', label)

const hold = async (page: Page, ...keys: string[]) => {
  for (const key of keys) await page.keyboard.down(key)
}
const autodrive = async (page: Page) => {
  await page.keyboard.press('f')
  await page.waitForSelector('[data-assistance="full"]')
}

const laneChangeTaps = [
  { at: 10, key: 'a' },
  { at: 11.5, key: 'd' },
  { at: 13, key: 'd' },
  { at: 14.5, key: 'a' },
]
const firedTaps = new Set<number>()

const scenarios: Scenario[] = [
  {
    id: 'autodrive-max-roadster',
    title: 'Autodrive at maximum cruise speed in the roadster',
    vehicle: 'roadster',
    cruiseSpeed: 45,
    seconds: 24,
    setup: autodrive,
  },
  {
    id: 'autodrive-max-motorcycle',
    title: 'Autodrive at maximum cruise speed on the motorcycle',
    vehicle: 'motorcycle',
    cruiseSpeed: 45,
    seconds: 24,
    setup: autodrive,
  },
  {
    id: 'autosteer-floored-touring',
    title: 'Autosteer with the throttle and boost held down in the touring car',
    vehicle: 'touring',
    cruiseSpeed: 45,
    seconds: 24,
    setup: async (page) => {
      await autodrive(page)
      await hold(page, 'w', 'Shift')
      await page.waitForSelector('[data-assistance="steer"]')
    },
  },
  {
    id: 'lane-change-taps-roadster',
    title:
      'Driver steering taps for lane changes at high speed, then autodrive re-engaged, in the roadster',
    vehicle: 'roadster',
    cruiseSpeed: 45,
    seconds: 24,
    setup: autodrive,
    during: async (page, elapsed) => {
      for (const [index, tap] of laneChangeTaps.entries())
        if (elapsed >= tap.at && !firedTaps.has(index)) {
          firedTaps.add(index)
          await page.keyboard.down(tap.key)
          await page.waitForTimeout(120)
          await page.keyboard.up(tap.key)
          await page.waitForTimeout(250)
          for (let attempt = 0; attempt < 2; attempt++)
            if (
              (await page.locator('[data-assistance]').getAttribute('data-assistance')) !== 'full'
            )
              await page.keyboard.press('f')
        }
    },
  },
]

async function convert(directory: string, args: string[]) {
  const child = Bun.spawn([ffmpeg as string, '-y', '-loglevel', 'error', ...args], {
    cwd: directory,
    stderr: 'pipe',
  })
  if ((await child.exited) !== 0) throw new Error(await new Response(child.stderr).text())
}

type Telemetry = Awaited<ReturnType<typeof record>>['telemetry']

async function record(scenario: Scenario) {
  const directory = resolve(root, scenario.id)
  await rm(directory, { recursive: true, force: true })
  await mkdir(directory, { recursive: true })
  const browser = await chromium.launch({
    executablePath: browserExecutable(),
    headless: true,
    args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
  })
  const errors: string[] = []
  const samples: Sample[] = []
  const frameTimes: number[] = []
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.addInitScript(
      ({ vehicle, cruiseSpeed }) => {
        localStorage.setItem('slowroads-settings', JSON.stringify({ vehicle, cruiseSpeed }))
        const intervals: number[] = []
        let previous = 0
        const tick = (now: number) => {
          if (previous) intervals.push(now - previous)
          previous = now
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
        Object.assign(window, { judgeFrameIntervals: intervals })
      },
      { vehicle: scenario.vehicle, cruiseSpeed: scenario.cruiseSpeed },
    )
    await page.goto(url)
    await page.locator('.intro .primary-button').click({ timeout: 30000 })
    await page.waitForSelector(`[data-vehicle="${scenario.vehicle}"]`)
    await scenario.setup(page)
    await page.evaluate(() => {
      ;(window as unknown as { judgeFrameIntervals: number[] }).judgeFrameIntervals.length = 0
    })
    const start = performance.now()
    let frame = 0
    let nextShot = 0
    while ((performance.now() - start) / 1000 < scenario.seconds) {
      const elapsed = (performance.now() - start) / 1000
      await scenario.during?.(page, elapsed)
      samples.push(
        await page.evaluate((time) => {
          const drive = document.querySelector('.drive')
          return {
            time,
            speed: Number(document.querySelector('.speed-value')?.textContent),
            steering: Number(drive?.getAttribute('data-steering')),
            assistance:
              document.querySelector('[data-assistance]')?.getAttribute('data-assistance') ?? '',
            boost: drive?.getAttribute('data-boost') ?? '',
          }
        }, elapsed),
      )
      if (elapsed >= nextShot) {
        await page.screenshot({
          path: resolve(directory, `frame-${String(frame++).padStart(3, '0')}.jpg`),
          type: 'jpeg',
          quality: 72,
        })
        nextShot += 0.5
      }
      await page.waitForTimeout(100)
    }
    frameTimes.push(
      ...(await page.evaluate(
        () => (window as unknown as { judgeFrameIntervals: number[] }).judgeFrameIntervals,
      )),
    )
  } finally {
    await browser.close()
  }
  const run = (args: string[]) => convert(directory, args)
  await run([
    '-framerate',
    '4',
    '-i',
    'frame-%03d.jpg',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    'clip.mp4',
  ])
  await run([
    '-i',
    'frame-%03d.jpg',
    '-vf',
    'select=not(mod(n\\,4)),scale=480:-1,tile=4x3',
    '-frames:v',
    '1',
    'sheet.jpg',
  ])
  const sorted = [...frameTimes].sort((a, b) => a - b)
  const percentile = (share: number) => sorted[Math.floor((sorted.length - 1) * share)] ?? 0
  const speeds = samples.map((sample) => sample.speed).filter(Number.isFinite)
  const steering = samples.map((sample) => Math.abs(sample.steering)).filter(Number.isFinite)
  const telemetry = {
    scenario: scenario.title,
    vehicle: scenario.vehicle,
    errors,
    frames: {
      count: sorted.length,
      medianMs: percentile(0.5),
      p95Ms: percentile(0.95),
      worstMs: percentile(1),
    },
    speedKmh: { min: Math.min(...speeds), max: Math.max(...speeds), final: speeds.at(-1) },
    steering: {
      meanAbs: steering.reduce((sum, value) => sum + value, 0) / Math.max(1, steering.length),
      maxAbs: Math.max(...steering),
    },
    assistance: [...new Set(samples.map((sample) => sample.assistance))],
    samples,
  }
  await Bun.write(resolve(directory, 'telemetry.json'), JSON.stringify(telemetry, null, 2))
  return { directory, telemetry }
}

async function review(scenario: Scenario, directory: string, telemetry: Telemetry) {
  if (!judge)
    return { verdict: 'skipped', reason: 'Install the grok CLI to enable independent review.' }
  const frames = (await Array.fromAsync(new Bun.Glob('frame-*.jpg').scan(directory))).sort()
  const picks = [0.2, 0.45, 0.7, 0.95].map(
    (share) => frames[Math.floor((frames.length - 1) * share)] ?? '',
  )
  const images = []
  for (const [index, frame] of ['sheet.jpg', ...picks].entries()) {
    const target = resolve(directory, `judge-${index}.jpg`)
    await convert(directory, ['-i', frame, '-vf', 'scale=640:-1', '-q:v', '5', target])
    images.push({
      type: 'image',
      mimeType: 'image/jpeg',
      data: Buffer.from(await Bun.file(target).arrayBuffer()).toString('base64'),
    })
  }
  const trace = telemetry.samples
    .filter((_, index) => index % 5 === 0)
    .map(
      (sample) =>
        `${sample.time.toFixed(1)}s ${sample.speed}km/h steer ${sample.steering.toFixed(3)} ${sample.assistance}`,
    )
    .join('; ')
  const prompt = [
    'You are an independent reviewer for a relaxing endless driving game. Judge only what the evidence shows.',
    `Scenario: ${scenario.title}.`,
    'Image 1 is a 4x3 contact sheet in time order, two seconds apart. Images 2 to 5 are single frames at 20, 45, 70, and 95 percent of the run.',
    'Look for: the vehicle leaving the road or spinning, oscillating or twitchy steering, the camera jerking, terrain or wheels clipping, popping or missing scenery, broken lighting or sky, and stutter in the frame timings.',
    `Frame timing and speed summary: ${JSON.stringify({ frames: telemetry.frames, speedKmh: telemetry.speedKmh, steering: telemetry.steering, assistance: telemetry.assistance, errors: telemetry.errors })}`,
    `Speed and steering trace: ${trace}`,
    'Scores are 1 to 10. Fail the run if the vehicle leaves the road, spins, or a visual defect would be obvious to a player.',
    'Reply with only one JSON object and nothing else: {"verdict":"pass"|"fail","scores":{"stability":n,"laneKeeping":n,"visuals":n,"smoothness":n},"issues":["..."]}',
  ].join('\n')
  const child = Bun.spawn(
    [
      judge,
      '--prompt-json',
      JSON.stringify([{ type: 'text', text: prompt }, ...images]),
      '-m',
      model,
      '--permission-mode',
      'plan',
      '--max-turns',
      '2',
      '--no-subagents',
      '--cwd',
      directory,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  )
  const timeout = setTimeout(() => child.kill(), 240000)
  const output = await new Response(child.stdout).text()
  clearTimeout(timeout)
  await child.exited
  await Bun.write(resolve(directory, 'judge.txt'), output)
  const json = output.match(/\{[\s\S]*\}/)?.[0]
  const parsed = json ? verdictSchema.safeParse(JSON.parse(json)) : undefined
  return parsed?.success ? parsed.data : { verdict: 'unparsed', output: output.slice(-600) }
}

const results = []
for (const scenario of scenarios.filter((entry) => !only.length || only.includes(entry.id))) {
  const { directory, telemetry } = await record(scenario)
  const verdict = await review(scenario, directory, telemetry)
  await Bun.write(resolve(directory, 'verdict.json'), JSON.stringify(verdict, null, 2))
  results.push({
    id: scenario.id,
    frames: telemetry.frames,
    speed: telemetry.speedKmh,
    errors: telemetry.errors,
    verdict,
  })
  console.log(JSON.stringify(results.at(-1)))
}
await Bun.write(resolve(root, 'summary.json'), JSON.stringify(results, null, 2))
console.log(`Judge results: ${root}/summary.json`)
if (results.some((result) => 'verdict' in result.verdict && result.verdict.verdict === 'fail'))
  process.exitCode = 1
