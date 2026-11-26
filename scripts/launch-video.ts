import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
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

interface Shot extends Scene {
  seconds: number
  from: View
  to: View
  overlay: 'intro' | 'mark' | 'outro'
  sound: string
}

const shots: Shot[] = [
  {
    name: 'intro',
    hash: 'highlands-12@2.0',
    settings: {
      landscape: 'highlands',
      season: 'summer',
      daylight: 'day',
      vehicle: 'touring',
      color: '#a3211b',
    },
    seconds: 5,
    from: [2.1, 0.14, 1.25],
    to: [2.5, 0.1, 1.05],
    overlay: 'intro',
    sound: 'touring-wind',
  },
  {
    name: 'supercar',
    hash: 'highlands-31@4.0',
    settings: {
      landscape: 'highlands',
      season: 'autumn',
      daylight: 'day',
      vehicle: 'supercar',
      color: '#e0b21f',
    },
    seconds: 3.6,
    from: [2.55, 0.06, 0.9],
    to: [2.55, 0.06, 0.9],
    overlay: 'mark',
    sound: 'supercar-wind',
  },
  {
    name: 'alpine',
    hash: 'alpine-3@1.0',
    settings: {
      landscape: 'alpine',
      season: 'winter',
      daylight: 'dawn',
      vehicle: 'hatchback',
      color: '#2f4f9e',
    },
    seconds: 3.6,
    from: [1.375, 0.12, 1.1],
    to: [1.725, 0.08, 0.95],
    overlay: 'mark',
    sound: 'hatchback-wind',
  },
  {
    name: 'bonnet',
    hash: 'fjord-8@2.0',
    settings: {
      landscape: 'fjord',
      season: 'summer',
      daylight: 'day',
      vehicle: 'touring',
      color: '#ece7dc',
    },
    camera: 'bonnet',
    seconds: 3.2,
    from: [0, 0, 1],
    to: [0, 0, 1],
    overlay: 'mark',
    sound: 'touring-bonnet-pull',
  },
  {
    name: 'desert',
    hash: 'desert-7@3.0',
    settings: {
      landscape: 'desert',
      season: 'summer',
      daylight: 'sunset',
      vehicle: 'pickup',
      color: '#d9772b',
    },
    seconds: 3.6,
    from: [2.35, 0.08, 0.9],
    to: [2.65, 0.12, 1.05],
    overlay: 'mark',
    sound: 'pickup-wind',
  },
  {
    name: 'jungle',
    hash: 'jungle-9@4.0',
    settings: {
      landscape: 'jungle',
      season: 'summer',
      daylight: 'sunset',
      vehicle: 'supercar',
      color: '#a3211b',
    },
    seconds: 4,
    from: [2.35, 0.06, 1],
    to: [2.65, 0.05, 0.9],
    overlay: 'mark',
    sound: 'supercar-wind',
  },
  {
    name: 'bus',
    hash: 'highlands-21@3.0',
    settings: {
      landscape: 'highlands',
      season: 'summer',
      daylight: 'day',
      vehicle: 'bus',
      color: '#3f8f7a',
    },
    seconds: 3.4,
    from: [2.788, 0.1, 1.3],
    to: [3.163, 0.05, 1.15],
    overlay: 'mark',
    sound: 'bus-wind',
  },
  {
    name: 'canyon',
    hash: 'canyon-5@3.0',
    settings: {
      landscape: 'canyon',
      season: 'summer',
      daylight: 'sunset',
      vehicle: 'motorcycle',
      color: '#1f6b3a',
    },
    seconds: 3.4,
    from: [2.15, 0.06, 0.8],
    to: [2.45, 0.08, 0.85],
    overlay: 'mark',
    sound: 'motorcycle-wind',
  },
  {
    name: 'night',
    hash: 'forest-7@5.0',
    settings: {
      landscape: 'forest',
      season: 'summer',
      daylight: 'night',
      vehicle: 'touring',
      color: '#e9e9e4',
    },
    seconds: 4,
    from: [2.462, 0.06, 1.2],
    to: [2.788, 0.05, 1.05],
    overlay: 'mark',
    sound: 'touring-dusk-forest',
  },
  {
    name: 'fog',
    hash: 'alpine-9@4.0',
    settings: {
      landscape: 'alpine',
      season: 'autumn',
      daylight: 'day',
      weather: 'fog',
      vehicle: 'roadster',
      color: '#ece7dc',
    },
    seconds: 3.6,
    from: [2.55, 0.1, 1],
    to: [2.85, 0.08, 0.95],
    overlay: 'mark',
    sound: 'roadster-wind',
  },
  {
    name: 'violet',
    hash: 'highlands-44@5.0',
    settings: {
      landscape: 'highlands',
      season: 'autumn',
      daylight: 'dusk',
      vehicle: 'supercar',
      color: '#5b2a9e',
    },
    seconds: 3.6,
    from: [2.325, -0.05, 0.85],
    to: [2.575, -0.02, 0.95],
    overlay: 'mark',
    sound: 'supercar-wind',
  },
  {
    name: 'wide',
    hash: 'fjord-2@6.0',
    settings: {
      landscape: 'fjord',
      season: 'summer',
      daylight: 'sunset',
      vehicle: 'roadster',
      color: '#a3211b',
    },
    seconds: 4,
    from: [0.55, 0.5, 3],
    to: [0.35, 0.42, 3.3],
    overlay: 'mark',
    sound: 'roadster-wind',
  },
  {
    name: 'outro',
    hash: 'forest-7@5.0',
    settings: {
      landscape: 'forest',
      season: 'summer',
      daylight: 'dusk',
      vehicle: 'touring',
      color: '#a3211b',
    },
    seconds: 5,
    from: [3.075, 0.06, 1.15],
    to: [3.225, 0.1, 1.4],
    overlay: 'outro',
    sound: 'touring-wind',
  },
]

const base = option('url') ?? 'http://127.0.0.1:3002/'
const out = resolve(option('out') ?? '.review/launch')
const sounds = resolve(option('sounds') ?? '.review/sound')
const scale = Number(option('scale') ?? 2)
const crossfade = 0.25
const ease = (t: number) => t * t * (3 - 2 * t)

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
        const t = ease(frame / (count - 1))
        if (shot.camera !== 'bonnet')
          await aim(
            page,
            [0, 1, 2].map(
              (i) => (shot.from[i] ?? 0) + ((shot.to[i] ?? 0) - (shot.from[i] ?? 0)) * t,
            ) as View,
          )
        const progress = frame / count
        const fade = Math.min(1, progress * 2.5, shot.overlay === 'intro' ? (1 - progress) * 4 : 1)
        await overlay(page, shot.overlay, shot.overlay === 'mark' ? 1 : fade)
        await advance(page, 1)
        encoder.stdin.write(await page.screenshot({ type: 'jpeg', quality: 95 }))
      }
      console.log(`shot ${shot.name}: ${count} frames`)
    }
  } finally {
    await browser.close()
  }
  encoder.stdin.end()
  if ((await encoder.exited) !== 0) throw new Error('ffmpeg failed while encoding frames')
}

async function renderSoundtrack(path: string) {
  const needed = [...new Set(shots.map((shot) => shot.sound))]
  const missing = needed.filter((name) => !existsSync(`${sounds}/${name}.wav`))
  if (missing.length) {
    const vehicles = [...new Set(missing.map((name) => name.split('-')[0]))]
    const scenarios = [...new Set(missing.map((name) => name.slice(name.indexOf('-') + 1)))]
    await run([
      'bun',
      'scripts/sound-render.ts',
      '--url',
      base,
      '--out',
      sounds,
      '--vehicles',
      vehicles.join(','),
      '--scenarios',
      scenarios.join(','),
    ])
  }
  const inputs = shots.flatMap((shot) => ['-i', `${sounds}/${shot.sound}.wav`])
  const total = shots.reduce((sum, shot) => sum + shot.seconds, 0)
  const parts = shots.map((shot, index) => {
    const start = shot.sound.endsWith('bonnet-pull') ? 6 : 1
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
