import { chromium } from 'playwright-core'
import type { Settings } from '../src/game/world'
import { browserExecutable } from './browser'

const flags = process.argv.slice(2)
const uncapped = flags.includes('--uncapped')
const angle = flags.find((flag) => flag.startsWith('--angle='))?.slice(8)
const seconds = Number(flags.find((flag) => /^\d+$/.test(flag)) ?? 20)
const url = process.env.FRAME_URL ?? 'http://localhost:3002/'
const qualities: Settings['quality'][] = ['high', 'ultra']

interface Readout {
  quality: string
  scale: number
  relief: number
}

function percentile(sorted: number[], fraction: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0
}

async function measure(quality: Settings['quality']) {
  const browser = await chromium.launch({
    executablePath: browserExecutable(),
    headless: true,
    args: [
      '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization',
      ...(angle ? [`--use-angle=${angle}`] : []),
      ...(uncapped ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []),
    ],
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
    await page.addInitScript((quality) => {
      localStorage.setItem('slow-voyage-settings', JSON.stringify({ quality }))
      localStorage.setItem('slow-voyage-ultra', 'offered')
      const intervals: number[] = []
      let previous = 0
      const tick = (now: number) => {
        if (previous) intervals.push(now - previous)
        previous = now
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      Object.assign(window, { frameIntervals: intervals })
    }, quality)
    await page.goto(url)
    await page.locator('.intro .primary-button').click({ timeout: 60000 })
    await page.keyboard.press('f')
    await page.waitForSelector('[data-assistance="full"]')
    await page.waitForTimeout(6000)
    await page.evaluate(() => {
      ;(window as unknown as { frameIntervals: number[] }).frameIntervals.length = 0
    })
    await page.waitForTimeout(seconds * 1000)
    const result = await page.evaluate(() => {
      const scope = window as unknown as {
        frameIntervals: number[]
        voyage?: { frameBudget(): Readout }
      }
      const readout = scope.voyage?.frameBudget()
      const context = document.createElement('canvas').getContext('webgl2')
      const debug = context?.getExtension('WEBGL_debug_renderer_info')
      return {
        intervals: scope.frameIntervals,
        readout: readout ? { ...readout } : null,
        renderer:
          context && debug ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '',
      }
    })
    const sorted = result.intervals.sort((a, b) => a - b)
    return {
      quality,
      frames: sorted.length,
      median: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      readout: result.readout,
      renderer: result.renderer,
    }
  } finally {
    await browser.close()
  }
}

console.log(`${seconds} s of autodrive at 1600x900, ${uncapped ? 'uncapped' : 'display paced'}`)
for (const [index, quality] of qualities.entries()) {
  const run = await measure(quality)
  if (index === 0) console.log(`renderer: ${run.renderer || 'unknown'}`)
  const readout = run.readout
    ? `, ended on ${run.readout.quality} at ${run.readout.scale.toFixed(2)}x, relief ${run.readout.relief}`
    : ''
  console.log(
    `${quality.padEnd(5)} median ${run.median.toFixed(2)} ms, p95 ${run.p95.toFixed(2)} ms, ${run.frames} frames${readout}`,
  )
}
