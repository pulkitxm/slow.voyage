import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import {
  type EngineSound,
  EngineVoice,
  engineSounds,
  firingFrequency,
  soundVehicles,
} from '../src/game/engine-sound'
import { engineCatalog, swapEngines } from '../src/game/engines'
import { type EngineProfile, engineProfiles } from '../src/game/powertrain'
import { SoundFrame } from '../src/game/sound-frame'
import { channelIndex, paramIndex, SoundSynth, soundChannels } from '../src/game/sound-synth'
import { freshAmbience } from '../src/game/soundscape'
import { type EngineId, engineIds } from '../src/game/world'
import { browserExecutable } from './browser'
import {
  decibels,
  frameRateRipple,
  levels,
  peakNear,
  spectrogram,
  spectrum,
  wave,
} from './sound-analysis'
import { frameRate, scenarios, stage } from './sound-scenarios'

const rate = 48000
const option = (name: string) => {
  const at = process.argv.indexOf(`--${name}`)
  return at < 0 ? undefined : process.argv[at + 1]
}
const out = option('out') ?? '.review/sound'
const url = option('url')
const chosen = option('vehicles')?.split(',') ?? [...soundVehicles]
const wanted = option('scenarios')?.split(',')
const engine = (option('engine') ?? 'stock') as EngineId
if (!engineIds.includes(engine)) throw new Error(`Unknown engine ${engine}`)
await mkdir(out, { recursive: true })
const failures: string[] = []
const check = (passed: boolean, message: string) => {
  if (!passed) failures.push(message)
}
const report: Record<string, unknown> = {}

function steadyEngine(
  sound: EngineSound,
  profile: Pick<EngineProfile, 'idle' | 'redline'>,
  rpm: number,
  load: number,
) {
  const engine = new EngineVoice(rate, 1)
  engine.configure(sound)
  engine.steady = true
  engine.idle = profile.idle
  engine.redline = profile.redline
  engine.rpm = rpm
  engine.load = engine.throttle = load
  const size = 1 << 17
  const left = new Float32Array(size + rate)
  const block = [0, 1, 2, 3].map(() => new Float32Array(128))
  for (let at = 0; at + 128 <= left.length; at += 128) {
    engine.render(
      block[0] as Float32Array,
      block[1] as Float32Array,
      block[2] as Float32Array,
      block[3] as Float32Array,
      128,
    )
    left.set(block[0] as Float32Array, at)
  }
  return spectrum(left, rate, size)
}

console.log('Engine firing frequencies')
const firing: Record<string, unknown>[] = []
const voices = [
  ...soundVehicles.map((vehicle) => ({
    name: vehicle as string,
    sound: engineSounds[vehicle],
    profile: engineProfiles[vehicle] as Pick<EngineProfile, 'idle' | 'redline'>,
  })),
  ...swapEngines.map((id) => ({
    name: id as string,
    sound: engineCatalog[id].sound,
    profile: engineCatalog[id].profile,
  })),
]
for (const { name: vehicle, sound, profile } of voices) {
  for (const share of [0.15, 0.5, 0.9]) {
    const rpm = Math.round(profile.idle + (profile.redline - profile.idle) * share)
    const magnitude = steadyEngine(sound, profile, rpm, 0.8)
    const expected = firingFrequency(sound, rpm)
    const found = peakNear(magnitude, rate, expected, 0.03)
    const cycle = rpm / 120
    let loudest = 0
    let order = 0
    for (let n = 1; n <= sound.cylinders * 4; n++) {
      const line = peakNear(magnitude, rate, cycle * n, 0.01).level
      if (line > loudest) {
        loudest = line
        order = n
      }
    }
    const error = Math.abs(found.frequency - expected)
    firing.push({ vehicle, rpm, expected, measured: found.frequency, strongestOrder: order / 2 })
    check(error < 0.25, `${vehicle} fires ${error.toFixed(2)} Hz away at ${rpm} rpm`)
    console.log(
      `  ${vehicle.padEnd(10)} ${String(rpm).padStart(5)} rpm  expected ${expected.toFixed(2).padStart(7)} Hz  measured ${found.frequency.toFixed(2).padStart(7)} Hz  ${decibels(found.level).toFixed(1)} dB  strongest order ${order / 2}`,
    )
  }
}
report.firing = firing

console.log('Parameter steps: frame rate ripple with coarse updates against fine updates')
const ripples: Record<string, { coarse: number; fine: number }> = {}
for (const vehicle of soundVehicles) {
  const profile = engineProfiles[vehicle]
  const seconds = 6
  const sweep = (step: number) => {
    const synth = new SoundSynth(rate, 1)
    synth.engine.steady = true
    const mono = new Float32Array(rate * seconds)
    const channels = soundChannels.map(() => new Float32Array(step))
    const p = synth.params
    p[paramIndex.vehicle] = soundVehicles.indexOf(vehicle)
    p[paramIndex.idle] = profile.idle
    p[paramIndex.redline] = profile.redline
    for (let at = 0; at + step <= mono.length; at += step) {
      const along = at / mono.length
      p[paramIndex.rpm] = profile.idle + (profile.redline - profile.idle) * along
      p[paramIndex.load] = p[paramIndex.throttle] = 0.3 + 0.7 * along
      p[paramIndex.speed] = 50 * along
      p[paramIndex.roll] = 0.16 * along
      p[paramIndex.rush] = 0.24 * along * along
      p[paramIndex.band] = 260 + 1700 * along
      p[paramIndex.squealLeft] = p[paramIndex.squealRight] = 0.11 * along
      p[paramIndex.squealPitch] = 1100 - 200 * along
      synth.render(channels, step)
      for (let i = 0; i < step; i++) {
        let sum = 0
        for (const channel of channels) sum += channel[i] as number
        mono[at + i] = sum
      }
    }
    return frameRateRipple(mono, rate, frameRate)
  }
  const coarse = sweep(rate / frameRate)
  const fine = sweep(128)
  ripples[vehicle] = { coarse, fine }
  check(
    coarse < 10 && coarse - fine < 6,
    `${vehicle} carries a ${coarse.toFixed(1)} dB frame rate ripple, ${fine.toFixed(1)} dB with fine updates`,
  )
  console.log(
    `  ${vehicle.padEnd(10)} frame rate updates ${coarse.toFixed(1)} dB, fine updates ${fine.toFixed(1)} dB`,
  )
}
report.frameRateRipple = ripples

console.log('Render cost of the synthesis core')
{
  const synth = new SoundSynth(rate, 1)
  const channels = soundChannels.map(() => new Float32Array(128))
  const p = synth.params
  const busy: Partial<Record<keyof typeof paramIndex, number>> = {
    vehicle: 3,
    rpm: 7000,
    idle: 1000,
    redline: 8800,
    load: 1,
    throttle: 1,
    speed: 45,
    roll: 0.1,
    wet: 0.1,
    gravel: 0.1,
    grass: 0.1,
    grains: 40,
    squealLeft: 0.1,
    squealRight: 0.1,
    skid: 0.1,
    scrub: 0.1,
    joint: 9,
    jointLevel: 0.3,
    scrape: 0.1,
    wade: 0.1,
    brake: 0.02,
    rush: 0.2,
    whistle: 0.03,
    buffet: 0.1,
    breeze: 0.02,
    leaves: 0.03,
    rain: 0.07,
    birds: 0.5,
    insects: 0.5,
    cicadas: 0.05,
    water: 0.05,
    surf: 0.1,
    falls: 0.1,
  }
  const measure = (seconds: number) => {
    const blocks = Math.round((seconds * rate) / 128)
    const times = new Float64Array(blocks)
    for (let block = 0; block < blocks; block++) {
      const from = performance.now()
      synth.render(channels, 128)
      times[block] = performance.now() - from
    }
    const sorted = Array.from(times).sort((a, b) => a - b)
    const total = sorted.reduce((sum, value) => sum + value, 0)
    return {
      share: total / (seconds * 1000),
      typical: sorted[Math.floor(blocks / 2)] ?? 0,
      slow: sorted[Math.floor(blocks * 0.999)] ?? 0,
      worst: sorted[blocks - 1] ?? 0,
    }
  }
  for (const [name, value] of Object.entries(busy))
    p[paramIndex[name as keyof typeof paramIndex]] = value
  measure(4)
  const loaded = measure(30)
  p.fill(0)
  p[paramIndex.idle] = 1000
  p[paramIndex.redline] = 8800
  p[paramIndex.vehicle] = 3
  measure(4)
  const silent = measure(30)
  const budget = (128 / rate) * 1000
  for (const [name, cost] of [
    ['every voice sounding', loaded],
    ['after falling silent', silent],
  ] as const)
    console.log(
      `  ${name.padEnd(22)} ${(cost.share * 100).toFixed(2)}% of one core, block median ${cost.typical.toFixed(3)} ms, 99.9th ${cost.slow.toFixed(3)} ms, worst ${cost.worst.toFixed(3)} ms of ${budget.toFixed(2)} ms`,
    )
  check(loaded.share < 0.25, 'the synthesis core costs more than a quarter of a core')
  check(silent.slow < loaded.slow * 3 + 0.2, 'the silent tail renders slower than the busy one')
  report.cost = { loaded, silent, budget }
}

console.log('Frame mapping cost on the main thread')
{
  const { car, settings, drive } = stage('touring', 'pull')
  const frame = new SoundFrame()
  const ambience = freshAmbience()
  let spent = 0
  const frames = 6000
  for (let index = 0; index < frames; index++) {
    const input = drive(index / frameRate, car, 'touring')
    car.update(1 / frameRate, input, settings)
    const from = performance.now()
    frame.update(car, input, settings, ambience, 1 / frameRate)
    spent += performance.now() - from
  }
  console.log(`  ${((spent / frames) * 1000).toFixed(2)} microseconds a frame`)
  report.frameMapping = spent / frames
}

console.log('Channel levels from simulated drives')
const channelLevels: Record<string, Record<string, number>> = {}
for (const vehicle of soundVehicles) {
  for (const name of ['idle', 'pull', 'skid', 'gravel', 'wind']) {
    const { scenario, car, settings, drive } = stage(vehicle, name)
    const synth = new SoundSynth(rate, 1)
    const frame = new SoundFrame()
    const ambience = freshAmbience()
    const step = rate / frameRate
    const channels = soundChannels.map(() => new Float32Array(step))
    const squares = new Float64Array(soundChannels.length)
    const sums = new Float64Array(soundChannels.length)
    let peak = 0
    const frames = scenario.seconds * frameRate
    for (let index = 0; index < frames; index++) {
      const input = drive(index / frameRate, car, vehicle)
      car.update(1 / frameRate, input, settings)
      synth.params.set(frame.update(car, input, settings, ambience, 1 / frameRate))
      synth.render(channels, step)
      for (let c = 0; c < channels.length; c++) {
        const data = channels[c] as Float32Array
        for (let i = 0; i < step; i++) {
          const value = data[i] as number
          squares[c] = (squares[c] as number) + value * value
          sums[c] = (sums[c] as number) + value
          if (Math.abs(value) > peak) peak = Math.abs(value)
          if (!Number.isFinite(value))
            check(false, `${vehicle} ${name} produced a non finite sample`)
        }
      }
    }
    const count = frames * step
    const row: Record<string, number> = {}
    for (const channel of soundChannels) {
      const c = channelIndex[channel]
      row[channel] = Math.sqrt((squares[c] as number) / count)
      check(
        Math.abs((sums[c] as number) / count) < 0.002,
        `${vehicle} ${name} ${channel} carries a constant offset`,
      )
    }
    channelLevels[`${vehicle}/${name}`] = row
    console.log(
      `  ${vehicle.padEnd(10)} ${name.padEnd(7)} exhaust ${decibels(row.exhaustLeft ?? 0).toFixed(1)} bay ${decibels(row.bay ?? 0).toFixed(1)} turbo ${decibels(row.turbo ?? 0).toFixed(1)} tyres ${decibels(row.tyresLeft ?? 0).toFixed(1)} debris ${decibels(row.debris ?? 0).toFixed(1)} wind ${decibels(row.windLeft ?? 0).toFixed(1)} peak ${decibels(peak).toFixed(1)}`,
    )
  }
}
report.channelLevels = channelLevels

if (url) {
  console.log(`Rendering the full mix in the browser from ${url}`)
  const browser = await chromium.launch({
    executablePath: browserExecutable(),
    args: ['--autoplay-policy=no-user-gesture-required'],
  })
  const page = await browser.newPage()
  page.on('pageerror', (error) => check(false, `page error: ${error.message}`))
  await page.goto(new URL('/robots.txt', url).href)
  const mixes: Record<string, unknown>[] = []
  for (const scenario of scenarios) {
    if (wanted && !wanted.includes(scenario.name)) continue
    for (const vehicle of scenario.only ? [scenario.only] : chosen) {
      const result = await page.evaluate(
        async ({ vehicle, name, engine, rate, frameRate, volume }) => {
          const origin = location.origin
          const [{ DriveAudio }, { stage }] = await Promise.all([
            import(`${origin}/src/game/audio.ts`),
            import(`${origin}/scripts/sound-scenarios.ts`),
          ])
          const { scenario, settings, car, drive } = stage(vehicle, name, engine)
          if (volume) settings.volume = volume
          const context = new OfflineAudioContext(2, rate * scenario.seconds, rate)
          const audio = new DriveAudio()
          audio.start(settings.volume, context)
          await audio.ready
          const frames = scenario.seconds * frameRate
          let spent = 0
          const advance = (index: number) => {
            const input = drive(index / frameRate, car, vehicle)
            car.update(1 / frameRate, input, settings)
            const from = performance.now()
            audio.update(car, input, settings, false, 1 / frameRate, 0)
            spent += performance.now() - from
          }
          advance(0)
          const schedule = (index: number) => {
            if (index >= frames) return
            void context.suspend(index / frameRate).then(() => {
              advance(index)
              schedule(index + 1)
              void context.resume()
            })
          }
          schedule(1)
          const began = performance.now()
          const rendered = await context.startRendering()
          const took = performance.now() - began
          const encode = (data: Float32Array) => {
            const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            let text = ''
            for (let at = 0; at < bytes.length; at += 32768)
              text += String.fromCharCode(...bytes.subarray(at, at + 32768))
            return btoa(text)
          }
          return {
            worklet: audio.worklet,
            update: spent / frames,
            took,
            seconds: scenario.seconds,
            left: encode(rendered.getChannelData(0)),
            right: encode(rendered.getChannelData(1)),
          }
        },
        {
          vehicle,
          name: scenario.name,
          engine,
          rate,
          frameRate,
          volume: Number(option('volume') ?? 0),
        },
      )
      const decode = (text: string) => new Float32Array(Buffer.from(text, 'base64').buffer)
      const left = decode(result.left)
      const right = decode(result.right)
      const mono = new Float32Array(left.length)
      for (let i = 0; i < left.length; i++)
        mono[i] = ((left[i] as number) + (right[i] as number)) / 2
      const heard = levels(mono)
      const peak = Math.max(levels(left).peak, levels(right).peak)
      const base = `${out}/${vehicle}-${engine === 'stock' ? '' : `${engine}-`}${scenario.name}`
      await Bun.write(`${base}.wav`, wave([left, right], rate))
      await Bun.write(`${base}.png`, spectrogram(mono, rate))
      check(result.worklet, `${vehicle} ${scenario.name} fell back from the worklet`)
      check(
        decibels(peak) < -1,
        `${vehicle} ${scenario.name} peaks at ${decibels(peak).toFixed(2)} dBFS`,
      )
      check(Math.abs(heard.offset) < 0.001, `${vehicle} ${scenario.name} carries a constant offset`)
      mixes.push({
        vehicle,
        scenario: scenario.name,
        peak: decibels(peak),
        rms: decibels(heard.rms),
        offset: heard.offset,
        renderShare: result.took / (result.seconds * 1000),
        updateMilliseconds: result.update,
      })
      console.log(
        `  ${vehicle.padEnd(10)} ${scenario.name.padEnd(12)} peak ${decibels(peak).toFixed(2)} dBFS  rms ${decibels(heard.rms).toFixed(1)} dB  offset ${heard.offset.toExponential(1)}  graph render ${((result.took / (result.seconds * 1000)) * 100).toFixed(1)}% of real time  update ${(result.update * 1000).toFixed(0)} us a frame`,
      )
    }
  }
  report.mixes = mixes
  await browser.close()
}

await Bun.write(`${out}/report.json`, JSON.stringify(report, null, 2))
if (failures.length) {
  console.error(`\n${failures.length} checks failed`)
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}
console.log('\nEvery check passed')
