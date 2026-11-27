import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { carBodies } from '../src/game/car-bodies'
import {
  advance,
  aim,
  mediaFps,
  openCapture,
  option,
  overlay,
  run,
  type Scene,
  stage,
  type View,
} from './media-capture'

interface Shot extends Omit<Scene, 'settings'> {
  car?: string
  color?: string
  scene: Record<string, unknown>
  seconds: number
  from: View
  to: View
  overlay: 'intro' | 'mark' | 'outro'
}

const plan: Shot[] = [
  {
    name: 'intro',
    hash: 'highlands-12@2.0',
    car: 'ferrari-f8-tributo',
    scene: { landscape: 'highlands', season: 'summer', daylight: 'day' },
    seconds: 7,
    from: [2.25, 0.1, 1.15],
    to: [2.45, 0.08, 1.05],
    overlay: 'intro',
  },
  {
    name: 'chiron',
    hash: 'alpine-3@1.0',
    car: 'bugatti-chiron',
    scene: { landscape: 'alpine', season: 'summer', daylight: 'day' },
    seconds: 9,
    from: [2.3, 0.08, 1.05],
    to: [2.6, 0.06, 0.95],
    overlay: 'mark',
  },
  {
    name: 'mclaren-f1-lm',
    hash: 'fjord-8@2.0',
    car: 'mclaren-f1-lm',
    scene: { landscape: 'fjord', season: 'summer', daylight: 'sunset' },
    seconds: 9,
    from: [2.7, 0.06, 1],
    to: [2.45, 0.08, 1.05],
    overlay: 'mark',
  },
  {
    name: 'gt3-parked',
    hash: 'highlands-31@4.0',
    car: 'porsche-911-gt3',
    scene: { landscape: 'highlands', season: 'autumn', daylight: 'day' },
    park: { offset: 0, turn: 0 },
    seconds: 10,
    from: [1.7, 0.1, 1.05],
    to: [2.9, 0.06, 0.95],
    overlay: 'mark',
  },
  {
    name: 'aventador',
    hash: 'canyon-5@3.0',
    car: 'lamborghini-aventador-svj',
    scene: { landscape: 'canyon', season: 'summer', daylight: 'sunset' },
    seconds: 9,
    from: [2.35, 0.06, 0.95],
    to: [2.6, 0.05, 0.9],
    overlay: 'mark',
  },
  {
    name: 'f2004',
    hash: 'desert-7@3.0',
    car: 'ferrari-f2004',
    scene: { landscape: 'desert', season: 'summer', daylight: 'day' },
    seconds: 8,
    from: [2.5, 0.04, 0.85],
    to: [2.75, 0.03, 0.8],
    overlay: 'mark',
  },
  {
    name: 'gt-r-rain',
    hash: 'jungle-9@4.0',
    car: 'nissan-gt-r-r35',
    scene: { landscape: 'jungle', season: 'summer', daylight: 'day', weather: 'rain' },
    seconds: 9,
    from: [2.4, 0.08, 1.05],
    to: [2.65, 0.06, 1],
    overlay: 'mark',
  },
  {
    name: 'r8-bonnet',
    hash: 'fjord-2@6.0',
    car: 'audi-r8-v10',
    scene: { landscape: 'fjord', season: 'summer', daylight: 'day' },
    camera: 'bonnet',
    seconds: 8,
    from: [0, 0, 1],
    to: [0, 0, 1],
    overlay: 'mark',
  },
  {
    name: '787b-night',
    hash: 'forest-7@5.0',
    car: 'mazda-787b',
    scene: { landscape: 'forest', season: 'summer', daylight: 'night' },
    seconds: 9,
    from: [2.45, 0.06, 1.15],
    to: [2.75, 0.05, 1.05],
    overlay: 'mark',
  },
  {
    name: 'countach',
    hash: 'alpine-9@4.0',
    car: 'lamborghini-countach-lpi-800-4',
    scene: { landscape: 'alpine', season: 'winter', daylight: 'dawn' },
    seconds: 9,
    from: [2.3, 0.1, 1.05],
    to: [2.55, 0.08, 0.95],
    overlay: 'mark',
  },
  {
    name: 'amg-dusk',
    hash: 'highlands-44@5.0',
    car: 'mercedes-amg-gt-r',
    scene: { landscape: 'highlands', season: 'autumn', daylight: 'sunset' },
    seconds: 9,
    from: [2.35, -0.03, 0.9],
    to: [2.6, -0.01, 0.95],
    overlay: 'mark',
  },
  {
    name: 'chiron-parked',
    hash: 'fjord-2@6.0',
    car: 'bugatti-chiron',
    color: '#141518',
    scene: { landscape: 'fjord', season: 'summer', daylight: 'sunset' },
    park: { offset: 0, turn: 0 },
    seconds: 10,
    from: [-2.2, 0.08, 1.1],
    to: [-1.0, 0.12, 1.2],
    overlay: 'mark',
  },
  {
    name: 'outro',
    hash: 'forest-7@5.0',
    car: 'ferrari-f8-tributo',
    scene: { landscape: 'forest', season: 'summer', daylight: 'dusk' },
    seconds: 7,
    from: [3.0, 0.06, 1.15],
    to: [3.2, 0.1, 1.4],
    overlay: 'outro',
  },
]

interface Voice {
  file: string
  vehicle: string
  engine: string
  car: string
}

function cast(shot: Shot) {
  const body = shot.car ? carBodies.find((each) => each.id === shot.car) : null
  if (shot.car && !body) throw new Error(`No catalog car ${shot.car}`)
  const settings: Record<string, unknown> = body
    ? {
        vehicle: body.chassis,
        engine: body.engine,
        engineCar: body.name,
        engineView: 'car',
        color: shot.color ?? body.paint ?? '#a3211b',
        ...shot.scene,
      }
    : { ...shot.scene, ...(shot.color ? { color: shot.color } : {}) }
  const vehicle = String(settings.vehicle ?? 'touring')
  const voice: Voice = body
    ? { file: `${body.id}-cruise`, vehicle, engine: body.engine, car: body.name }
    : { file: `${vehicle}-cruise`, vehicle, engine: 'stock', car: '' }
  return { ...shot, settings, voice }
}

const only = option('only')?.split(',')
const shots = plan.filter((shot) => !only || only.includes(shot.name)).map(cast)

const base = option('url') ?? 'http://127.0.0.1:3002/'
const out = resolve(option('out') ?? '.review/launch')
const sounds = resolve(option('sounds') ?? '.review/sound')
const scale = Number(option('scale') ?? 2)
const crossfade = 0.25
const ease = (t: number) => t * t * (3 - 2 * t)

async function renderProof() {
  await mkdir(`${out}/proof`, { recursive: true })
  const { browser, page } = await openCapture(1920, 1080, scale)
  try {
    for (const [index, shot] of shots.entries()) {
      await stage(page, base, shot)
      await aim(page, shot.from)
      await advance(page, 30)
      const middle = Math.round((shot.seconds * mediaFps) / 2)
      for (let frame = 0; frame < middle; frame++) {
        if (shot.camera !== 'bonnet') await aim(page, along(shot, frame / (middle * 2 - 1)))
        await advance(page, 1)
      }
      await overlay(page, shot.overlay, 1)
      const file = `${out}/proof/${String(index + 1).padStart(2, '0')}-${shot.name}.jpg`
      await page.screenshot({ path: file, type: 'jpeg', quality: 88 })
      console.log(`proof ${file}`)
    }
  } finally {
    await browser.close()
  }
}

const along = (shot: Shot, progress: number) => {
  const t = ease(progress)
  return [0, 1, 2].map(
    (i) => (shot.from[i] ?? 0) + ((shot.to[i] ?? 0) - (shot.from[i] ?? 0)) * t,
  ) as View
}

async function renderPicture(path: string) {
  const encoder = Bun.spawn(
    [
      'ffmpeg',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'image2pipe',
      '-framerate',
      String(mediaFps),
      '-c:v',
      'mjpeg',
      '-i',
      '-',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '17',
      '-pix_fmt',
      'yuv420p',
      '-profile:v',
      'high',
      '-movflags',
      '+faststart',
      '-an',
      path,
    ],
    { stdin: 'pipe', stderr: 'inherit' },
  )
  const { browser, page } = await openCapture(1920, 1080, scale)
  try {
    for (const shot of shots) {
      await stage(page, base, shot)
      await aim(page, shot.from)
      await advance(page, 30)
      const count = Math.round(shot.seconds * mediaFps)
      for (let frame = 0; frame < count; frame++) {
        if (shot.camera !== 'bonnet') await aim(page, along(shot, frame / (count - 1)))
        const progress = frame / count
        const fade = Math.min(1, progress * 2.5, shot.overlay === 'intro' ? (1 - progress) * 4 : 1)
        await overlay(page, shot.overlay, shot.overlay === 'mark' ? 1 : fade)
        await advance(page, 1)
        encoder.stdin.write(await page.screenshot({ type: 'jpeg', quality: 95 }))
      }
      console.log(`shot ${shot.name}: ${count} frames, ${(count / mediaFps).toFixed(1)} s`)
    }
  } finally {
    await browser.close()
  }
  encoder.stdin.end()
  if ((await encoder.exited) !== 0) throw new Error('ffmpeg failed while encoding frames')
}

async function renderSoundtrack(path: string) {
  const voices = new Map(shots.map((shot) => [shot.voice.file, shot.voice]))
  for (const voice of voices.values()) {
    if (existsSync(`${sounds}/${voice.file}.wav`)) continue
    await run([
      'bun',
      'scripts/sound-render.ts',
      '--url',
      base,
      '--out',
      sounds,
      '--vehicles',
      voice.vehicle,
      '--engine',
      voice.engine,
      ...(voice.car ? ['--car', voice.car] : []),
      '--scenarios',
      'cruise',
    ])
  }
  const inputs = shots.flatMap((shot) => ['-i', `${sounds}/${shot.voice.file}.wav`])
  const total = shots.reduce((sum, shot) => sum + shot.seconds, 0)
  const parts = shots.map((shot, index) => {
    const start = 1
    const length = shot.seconds + (index < shots.length - 1 ? crossfade : 0)
    return `[${index}]atrim=${start}:${start + length},asetpts=N/SR/TB[s${index}]`
  })
  let chain = '[s0]'
  for (let index = 1; index < shots.length; index++) {
    parts.push(`${chain}[s${index}]acrossfade=d=${crossfade}:c1=tri:c2=tri[x${index}]`)
    chain = `[x${index}]`
  }
  parts.push(
    `${chain}afade=t=in:st=0:d=1.5,afade=t=out:st=${total - 3}:d=3,loudnorm=I=-16:TP=-1.5:LRA=11[out]`,
  )
  await run([
    'ffmpeg',
    '-loglevel',
    'error',
    '-y',
    ...inputs,
    '-filter_complex',
    parts.join(';'),
    '-map',
    '[out]',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-c:a',
    'pcm_s16le',
    path,
  ])
}

await mkdir(out, { recursive: true })
if (process.argv.includes('--proof')) {
  await renderProof()
  process.exit(0)
}
const label = scale >= 2 ? '4k' : '1080p'
const master = `${out}/slow-voyage-launch-${label}-silent.mp4`
const soundtrack = `${out}/soundtrack.wav`
const encode = (input: string, output: string, extra: string[]) =>
  run([
    'ffmpeg',
    '-loglevel',
    'error',
    '-y',
    '-i',
    input,
    ...extra,
    '-movflags',
    '+faststart',
    output,
  ])
if (!process.argv.includes('--sound-only')) await renderPicture(master)
await renderSoundtrack(soundtrack)
const withSound = ['-i', soundtrack, '-map', '0:v', '-map', '1:a', '-shortest']
await encode(master, `${out}/slow-voyage-launch-${label}.mp4`, [
  ...withSound,
  '-c:v',
  'copy',
  '-c:a',
  'aac',
  '-b:a',
  '256k',
])
if (label === '4k') {
  const social = `${out}/slow-voyage-launch-1080p.mp4`
  await encode(master, social, [
    ...withSound,
    '-vf',
    'scale=1920:1080:flags=lanczos',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '18',
    '-maxrate',
    '25M',
    '-bufsize',
    '50M',
    '-pix_fmt',
    'yuv420p',
    '-profile:v',
    'high',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
  ])
  await encode(social, `${out}/slow-voyage-launch-1080p-silent.mp4`, [
    '-map',
    '0:v',
    '-c:v',
    'copy',
  ])
}
console.log(`Launch video: ${out}`)
