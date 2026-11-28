import { existsSync } from 'node:fs'
import { mkdir, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { carBodies } from '../src/game/car-bodies'
import { browserExecutable } from './browser'
import {
  advance,
  cue,
  direct,
  openCapture,
  option,
  pace,
  type Rig,
  run,
  type Scene,
  stage,
} from './media-capture'

const subframes = 120
const output = 30

interface Shot extends Omit<Scene, 'settings'> {
  car?: string
  color?: string
  scene: Record<string, unknown>
  cruise?: number
  rig?: Rig
  seconds: number
  slow?: number
  actions?: Action[]
}

interface Action {
  at: number
  click?: string
  nth?: number
  type?: string
}

const shots: Shot[] = [
  {
    name: 'fjord-dawn',
    hash: 'fjord-8@2.0',
    car: 'ferrari-f8-tributo',
    scene: { landscape: 'fjord', season: 'summer', daylight: 'dawn' },
    rig: {
      kind: 'scenery',
      ahead: 140,
      side: -14,
      height: [9, 11],
      travel: 14,
      turn: [0.9, 0.82],
      pitch: -0.04,
      fov: 38,
    },
    seconds: 6,
  },
  {
    name: 'canyon-vista',
    hash: 'canyon-5@3.0',
    car: 'lamborghini-aventador-svj',
    scene: { landscape: 'canyon', season: 'summer', daylight: 'sunset' },
    rig: {
      kind: 'scenery',
      ahead: 120,
      side: 25,
      height: [30, 34],
      travel: 18,
      turn: [0.38, 0.3],
      pitch: -0.12,
      fov: 42,
    },
    seconds: 5,
  },
  {
    name: 'night-reveal',
    hash: 'forest-7@5.0',
    car: 'mazda-787b',
    scene: { landscape: 'forest', season: 'summer', daylight: 'night' },
    cruise: 17,
    rig: { kind: 'flyby', ahead: 70, side: 1.4, height: 0.45, fov: [26, 34], look: 0.5 },
    seconds: 6,
  },
  {
    name: 'chiron-detail',
    hash: 'fjord-2@6.0',
    car: 'bugatti-chiron',
    scene: { landscape: 'fjord', season: 'summer', daylight: 'day' },
    park: { offset: 0, turn: 0 },
    rig: { kind: 'orbit', angle: [0.32, 0.62], radius: 4.6, height: 0.75, fov: 30, look: 0.55 },
    seconds: 4,
  },
  {
    name: 'f8-detail',
    hash: 'highlands-31@4.0',
    car: 'ferrari-f8-tributo',
    scene: { landscape: 'highlands', season: 'autumn', daylight: 'sunset' },
    park: { offset: 0, turn: 0 },
    rig: { kind: 'orbit', angle: [2.6, 2.25], radius: 3.6, height: 0.7, fov: 30, look: 0.5 },
    seconds: 4,
  },
  {
    name: 'countach-detail',
    hash: 'alpine-9@4.0',
    car: 'lamborghini-countach-lpi-800-4',
    scene: { landscape: 'alpine', season: 'winter', daylight: 'dawn' },
    park: { offset: 0, turn: 0 },
    rig: { kind: 'orbit', angle: [1.45, 1.15], radius: 4.2, height: 0.5, fov: 28, look: 0.45 },
    seconds: 4,
  },
  {
    name: 'chiron-track',
    hash: 'alpine-3@1.0',
    car: 'bugatti-chiron',
    scene: { landscape: 'alpine', season: 'summer', daylight: 'day' },
    cruise: 21,
    rig: { kind: 'track', ahead: [7, 3], side: [-14, -12], height: 1.1, fov: 26 },
    seconds: 5,
  },
  {
    name: 'f8-flyby',
    hash: 'fjord-8@2.0',
    car: 'ferrari-f8-tributo',
    scene: { landscape: 'fjord', season: 'summer', daylight: 'sunset' },
    cruise: 23,
    rig: { kind: 'flyby', ahead: 55, side: -7, height: 1.1, fov: [30, 24] },
    seconds: 4.5,
  },
  {
    name: 'aventador-low',
    hash: 'canyon-5@3.0',
    car: 'lamborghini-aventador-svj',
    scene: { landscape: 'canyon', season: 'summer', daylight: 'sunset' },
    cruise: 22,
    rig: { kind: 'track', ahead: [6.5, 5.5], side: [2.4, 1.6], height: 0.35, fov: 34, look: 0.5 },
    seconds: 3,
  },
  {
    name: 'gt-r-rain',
    hash: 'jungle-9@4.0',
    car: 'nissan-gt-r-r35',
    scene: { landscape: 'jungle', season: 'summer', daylight: 'day', weather: 'rain' },
    cruise: 20,
    rig: { kind: 'flyby', ahead: 45, side: 6, height: 0.7, fov: [32, 26] },
    seconds: 4,
    slow: 0.5,
  },
  {
    name: 'f2004-track',
    hash: 'desert-7@3.0',
    car: 'ferrari-f2004',
    scene: { landscape: 'desert', season: 'summer', daylight: 'day' },
    cruise: 30,
    rig: { kind: 'track', ahead: [1, -2], side: [-8, -7], height: 2.2, fov: 24, look: 0.4 },
    seconds: 3,
  },
  {
    name: 'gt3-drone',
    hash: 'highlands-31@4.0',
    car: 'porsche-911-gt3',
    scene: { landscape: 'highlands', season: 'autumn', daylight: 'day' },
    cruise: 20,
    rig: { kind: 'track', ahead: [-30, -18], side: [20, 26], height: [26, 20], fov: 30 },
    seconds: 4,
  },
  {
    name: 'countach-snow',
    hash: 'alpine-9@4.0',
    car: 'lamborghini-countach-lpi-800-4',
    scene: { landscape: 'alpine', season: 'winter', daylight: 'dawn' },
    cruise: 19,
    rig: { kind: 'flyby', ahead: 50, side: 8, height: 1.4, fov: [28, 22] },
    seconds: 4,
  },
  {
    name: 'amg-sunset',
    hash: 'highlands-44@5.0',
    car: 'mercedes-amg-gt-r',
    scene: { landscape: 'highlands', season: 'autumn', daylight: 'sunset' },
    cruise: 21,
    rig: { kind: 'track', ahead: [-9, -6], side: [-5, -3.5], height: 1.2, fov: 30 },
    seconds: 3,
  },
  {
    name: 'mclaren-low',
    hash: 'fjord-8@2.0',
    car: 'mclaren-f1-lm',
    scene: { landscape: 'fjord', season: 'summer', daylight: 'sunset' },
    cruise: 22,
    rig: { kind: 'track', ahead: [-5, -6], side: [1.9, 2.1], height: 0.3, fov: 36, look: 0.45 },
    seconds: 3,
  },
  {
    name: 'gt-r-track',
    hash: 'jungle-9@4.0',
    car: 'nissan-gt-r-r35',
    scene: { landscape: 'jungle', season: 'summer', daylight: 'day', weather: 'rain' },
    cruise: 20,
    rig: { kind: 'track', ahead: [4, 1], side: [8, 7], height: 1, fov: 28 },
    seconds: 3,
  },
  {
    name: 'f2004-flyby',
    hash: 'desert-7@3.0',
    car: 'ferrari-f2004',
    scene: { landscape: 'desert', season: 'summer', daylight: 'sunset' },
    cruise: 30,
    rig: { kind: 'flyby', ahead: 55, side: -6, height: 0.6, fov: [30, 22], look: 0.4 },
    seconds: 3,
  },
  {
    name: 'amg-flyby',
    hash: 'highlands-44@5.0',
    car: 'mercedes-amg-gt-r',
    scene: { landscape: 'highlands', season: 'autumn', daylight: 'sunset' },
    cruise: 22,
    rig: { kind: 'flyby', ahead: 45, side: 7, height: 1, fov: [30, 24] },
    seconds: 3,
  },
  {
    name: 'mclaren-flyby',
    hash: 'fjord-8@2.0',
    car: 'mclaren-f1-lm',
    scene: { landscape: 'fjord', season: 'summer', daylight: 'sunset' },
    cruise: 23,
    rig: { kind: 'flyby', ahead: 45, side: -5, height: 0.5, fov: [32, 24], look: 0.5 },
    seconds: 3,
  },
  {
    name: 'chiron-low',
    hash: 'alpine-3@1.0',
    car: 'bugatti-chiron',
    scene: { landscape: 'alpine', season: 'summer', daylight: 'day' },
    cruise: 22,
    rig: { kind: 'track', ahead: [6.5, 5.5], side: [-2.2, -1.6], height: 0.35, fov: 34, look: 0.5 },
    seconds: 3,
  },
  {
    name: 'countach-track',
    hash: 'alpine-9@4.0',
    car: 'lamborghini-countach-lpi-800-4',
    scene: { landscape: 'alpine', season: 'winter', daylight: 'dawn' },
    cruise: 19,
    rig: { kind: 'track', ahead: [3, -1], side: [-10, -9], height: 1.2, fov: 26 },
    seconds: 3,
  },
  {
    name: 'aventador-flyby',
    hash: 'canyon-5@3.0',
    car: 'lamborghini-aventador-svj',
    scene: { landscape: 'canyon', season: 'summer', daylight: 'sunset' },
    cruise: 22,
    rig: { kind: 'flyby', ahead: 50, side: 6, height: 1.5, fov: [30, 24] },
    seconds: 3,
  },
  {
    name: 'f8-drone',
    hash: 'fjord-8@2.0',
    car: 'ferrari-f8-tributo',
    scene: { landscape: 'fjord', season: 'summer', daylight: 'sunset' },
    cruise: 21,
    rig: { kind: 'track', ahead: [-25, -10], side: [-25, -30], height: [30, 22], fov: 32 },
    seconds: 3,
  },
  {
    name: 'car-gallery',
    hash: 'highlands-12@2.0',
    car: 'ferrari-f8-tributo',
    scene: { landscape: 'highlands', season: 'summer', daylight: 'day' },
    cruise: 18,
    ui: true,
    seconds: 9.5,
    actions: [
      { at: 0.3, click: 'button[aria-label="Open settings"]' },
      { at: 1, click: '[role="tab"]:has-text("vehicle")' },
      { at: 1.9, click: '.engine-pickers .engine-dropdown:first-child .engine-current' },
      { at: 3, click: '.engine-search input' },
      { at: 3.2, type: 'lambo' },
      { at: 4.8, click: '.engine-popover .engine-option:has-text("Aventador SVJ")' },
      { at: 5.9, click: '.swatches button', nth: 3 },
      { at: 6.8, click: '.swatches button', nth: 6 },
      { at: 7.7, click: '.engine-pickers .engine-dropdown:first-child .engine-current' },
    ],
  },
  {
    name: 'r8-bonnet',
    hash: 'fjord-2@6.0',
    car: 'audi-r8-v10',
    scene: { landscape: 'fjord', season: 'summer', daylight: 'day' },
    camera: 'bonnet',
    cruise: 24,
    ui: true,
    seconds: 4,
  },
  {
    name: 'aventador-drone',
    hash: 'canyon-5@3.0',
    car: 'lamborghini-aventador-svj',
    scene: { landscape: 'canyon', season: 'summer', daylight: 'sunset' },
    cruise: 22,
    rig: { kind: 'track', ahead: [40, 10], side: [-30, -40], height: [34, 46], fov: 34 },
    seconds: 4,
  },
  {
    name: 'chiron-finale',
    hash: 'fjord-2@6.0',
    car: 'bugatti-chiron',
    color: '#141518',
    scene: { landscape: 'fjord', season: 'summer', daylight: 'sunset' },
    cruise: 18,
    rig: { kind: 'track', ahead: [-12, -30], side: [-7, -13], height: [1.6, 6], fov: [30, 38] },
    seconds: 18,
    slow: 0.6,
  },
]

interface Cut {
  shot: string
  from?: number
  seconds: number
  crop?: [width: number, height: number, x: number, y: number]
}

interface Card {
  at: number
  seconds: number
  kind: 'title' | 'callout' | 'end'
  lines: string[]
}

interface Edit {
  cuts: Cut[]
  cards: Card[]
  music?: string
}

const edits: Record<string, Edit> = {
  launch: {
    cuts: [
      { shot: 'fjord-dawn', seconds: 6 },
      { shot: 'canyon-vista', seconds: 5 },
      { shot: 'night-reveal', seconds: 6 },
      { shot: 'chiron-detail', seconds: 4 },
      { shot: 'f8-detail', seconds: 4 },
      { shot: 'countach-detail', seconds: 4 },
      { shot: 'car-gallery', seconds: 9, crop: [1440, 810, 480, 120] },
      { shot: 'r8-bonnet', seconds: 4 },
      { shot: 'chiron-track', seconds: 3 },
      { shot: 'f8-flyby', from: 1, seconds: 2.5 },
      { shot: 'aventador-low', seconds: 2.5 },
      { shot: 'gt-r-rain', seconds: 3 },
      { shot: 'f2004-flyby', seconds: 2 },
      { shot: 'countach-snow', from: 0.5, seconds: 3 },
      { shot: 'gt3-drone', seconds: 3 },
      { shot: 'amg-flyby', seconds: 2 },
      { shot: 'mclaren-low', seconds: 2 },
      { shot: 'aventador-drone', seconds: 3 },
      { shot: 'gt-r-track', seconds: 2 },
      { shot: 'chiron-low', seconds: 2 },
      { shot: 'f2004-track', seconds: 2 },
      { shot: 'countach-track', seconds: 2 },
      { shot: 'mclaren-flyby', seconds: 2 },
      { shot: 'aventador-flyby', seconds: 2 },
      { shot: 'amg-sunset', seconds: 3 },
      { shot: 'f8-drone', seconds: 3 },
      { shot: 'chiron-finale', seconds: 18 },
    ],
    cards: [
      { at: 1.5, seconds: 4.2, kind: 'title', lines: ['A little further. A little slower.'] },
      { at: 18, seconds: 6, kind: 'callout', lines: ['87 real cars', 'Built to the real thing'] },
      { at: 30, seconds: 4.5, kind: 'callout', lines: ['Any car', 'In any colour'] },
      { at: 38.2, seconds: 3.4, kind: 'callout', lines: ['Every one', 'With its own engine'] },
      { at: 50, seconds: 4.5, kind: 'callout', lines: ['Rain, snow and fog', 'Seven landscapes'] },
      { at: 64.5, seconds: 4.5, kind: 'callout', lines: ['Day to night', 'One endless road'] },
      {
        at: 94,
        seconds: 10,
        kind: 'end',
        lines: ['slow.voyage', 'Take the long way home', 'Play free in your browser'],
      },
    ],
  },
  look: {
    cuts: [
      { shot: 'chiron-track', seconds: 5 },
      { shot: 'f8-flyby', seconds: 4.5 },
      { shot: 'chiron-detail', seconds: 4 },
      { shot: 'gt-r-rain', seconds: 4 },
    ],
    cards: [
      { at: 1, seconds: 3.4, kind: 'callout', lines: ['87 real cars', 'Built to the real thing'] },
    ],
  },
}

const base = option('url') ?? 'http://127.0.0.1:3002/'
const out = resolve(option('out') ?? '.review/trailer')
const clips = `${out}/clips`
const scale = Number(option('scale') ?? 1)
const only = option('only')?.split(',')
const edit = edits[option('edit') ?? 'look']
if (!edit) throw new Error(`Unknown edit ${option('edit')}`)

function cast(shot: Shot) {
  const body = shot.car ? carBodies.find((each) => each.id === shot.car) : null
  if (shot.car && !body) throw new Error(`No catalog car ${shot.car}`)
  return {
    ...shot,
    lead: 0,
    settings: {
      ...(body
        ? {
            vehicle: body.chassis,
            engine: body.engine,
            engineCar: body.name,
            engineView: 'car',
            color: shot.color ?? body.paint ?? '#a3211b',
          }
        : {}),
      cruiseSpeed: shot.cruise ?? 20,
      ...shot.scene,
    },
  }
}

async function renderClip(shot: Shot, path: string) {
  const encoder = Bun.spawn(
    [
      'ffmpeg',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'image2pipe',
      '-framerate',
      String(subframes),
      '-c:v',
      'mjpeg',
      '-i',
      '-',
      '-vf',
      `tmix=frames=2,select='not(mod(n\\,${subframes / output}))',setpts=N/${output}/TB`,
      '-r',
      String(output),
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '14',
      '-pix_fmt',
      'yuv420p',
      `${path}.part.mp4`,
    ],
    { stdin: 'pipe', stderr: 'inherit' },
  )
  const { browser, page } = await openCapture(1920, 1080, scale, subframes)
  try {
    await stage(page, base, cast(shot))
    await direct(page, shot.rig ?? null)
    await pace(page, 1)
    await advance(page, shot.park ? 60 : subframes * 6)
    await pace(page, shot.slow ?? 1)
    await direct(page, shot.rig ?? null)
    const count = Math.round(shot.seconds * subframes)
    const actions = [...(shot.actions ?? [])]
    for (let frame = 0; frame < count; frame++) {
      while (actions[0] && actions[0].at * subframes <= frame) {
        const action = actions.shift() as Action
        if (action.click)
          await page
            .locator(action.click)
            .nth(action.nth ?? 0)
            .click({ timeout: 10000 })
        if (action.type) await page.keyboard.type(action.type, { delay: 40 })
      }
      await cue(page, frame / (count - 1))
      await advance(page, 1)
      encoder.stdin.write(await page.screenshot({ type: 'jpeg', quality: 94, timeout: 180000 }))
    }
  } finally {
    await browser.close()
  }
  encoder.stdin.end()
  if ((await encoder.exited) !== 0) throw new Error(`ffmpeg failed on ${shot.name}`)
  await rename(`${path}.part.mp4`, path)
  console.log(`clip ${shot.name}: ${shot.seconds} s`)
}

const cardCss = `
body { margin: 0; width: 1920px; height: 1080px; background: transparent; font-family: "Manrope", sans-serif; color: #f4f1ea; }
.card { position: absolute; inset: 0; display: grid; text-shadow: 0 2px 30px rgba(0,0,0,0.35); }
.title { place-content: center; text-align: center; }
.title h1 { margin: 0; font-weight: 300; font-size: 92px; letter-spacing: -0.01em; line-height: 1.1; }
.title small { display: block; margin-top: 26px; font: 500 15px "DM Sans", sans-serif; letter-spacing: 0.5em; text-transform: uppercase; opacity: 0.85; }
.callout { align-content: end; padding: 0 0 200px 150px; }
.callout small { display: flex; align-items: center; gap: 20px; font: 500 15px "DM Sans", sans-serif; letter-spacing: 0.42em; text-transform: uppercase; opacity: 0.9; }
.callout small::before { content: ""; width: 56px; height: 1px; background: currentColor; }
.callout h2 { margin: 16px 0 0; font-weight: 300; font-size: 76px; letter-spacing: -0.015em; }
.end { place-content: center; text-align: center; background: rgba(8, 12, 10, 0.55); }
.end b { font-weight: 300; font-size: 120px; letter-spacing: 0.14em; }
.end small { display: block; margin-top: 18px; font: 500 16px "DM Sans", sans-serif; letter-spacing: 0.5em; text-transform: uppercase; opacity: 0.85; }
.end p { margin-top: 64px; font: 400 26px/1.6 "DM Sans", sans-serif; opacity: 0.92; }
`

function cardHtml(card: Card) {
  const [first = '', second = '', third = ''] = card.lines
  const body =
    card.kind === 'title'
      ? `<div class="card title"><h1>${first}</h1>${second ? `<small>${second}</small>` : ''}</div>`
      : card.kind === 'callout'
        ? `<div class="card callout"><small>${first}</small><h2>${second}</h2></div>`
        : `<div class="card end"><div><b>${first}</b><small>${second}</small><p>${third}</p></div></div>`
  return `<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&family=Manrope:wght@300;400&display=swap" rel="stylesheet"><style>${cardCss}</style></head><body>${body}</body></html>`
}

async function renderCards(cards: Card[]) {
  const browser = await chromium.launch({ executablePath: browserExecutable(), headless: true })
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  const files: string[] = []
  for (const [index, card] of cards.entries()) {
    await page.setContent(cardHtml(card), { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    const file = `${out}/card-${index}.png`
    await page.screenshot({ path: file, omitBackground: true })
    files.push(file)
  }
  await browser.close()
  return files
}

const grade = [
  'eq=contrast=1.07:saturation=1.08:gamma=0.97',
  'colorbalance=rs=-0.03:bs=0.04:rh=0.05:gh=0.01:bh=-0.04',
  'vignette=angle=PI/5',
  'noise=alls=5:allf=t',
].join(',')

const letterbox = [
  'drawbox=x=0:y=0:w=iw:h=ih*0.122:color=black:t=fill',
  'drawbox=x=0:y=ih*0.878:w=iw:h=ih*0.122:color=black:t=fill',
].join(',')

async function assemble(cut: Edit, path: string) {
  const cards = await renderCards(cut.cards)
  const inputs = [
    ...cut.cuts.flatMap((each) => [
      '-ss',
      String(each.from ?? 0),
      '-t',
      String(each.seconds),
      '-i',
      `${clips}/${each.shot}.mp4`,
    ]),
    ...cards.flatMap((file) => ['-loop', '1', '-i', file]),
    ...(cut.music ? ['-i', cut.music] : []),
  ]
  const total = cut.cuts.reduce((sum, each) => sum + each.seconds, 0)
  const framed = new Set(shots.filter((shot) => shot.ui).map((shot) => shot.name))
  const parts = cut.cuts.map(
    (each, index) =>
      `[${index}:v]${each.crop ? `crop=${each.crop.join(':')},` : ''}scale=1920:1080:flags=lanczos,setsar=1,fps=${output},setpts=PTS-STARTPTS${framed.has(each.shot) ? '' : `,${letterbox}`}[v${index}]`,
  )
  parts.push(
    `${cut.cuts.map((_, index) => `[v${index}]`).join('')}concat=n=${cut.cuts.length}:v=1:a=0,${grade},fade=t=in:st=0:d=0.8,fade=t=out:st=${total - 1.2}:d=1.2[base]`,
  )
  let chain = '[base]'
  cut.cards.forEach((card, index) => {
    const input = cut.cuts.length + index
    const end = card.at + card.seconds
    parts.push(
      `[${input}:v]format=rgba,fade=t=in:st=${card.at}:d=0.6:alpha=1,fade=t=out:st=${end - 0.6}:d=0.6:alpha=1,trim=0:${end},setpts=PTS-STARTPTS[c${index}]`,
    )
    parts.push(`${chain}[c${index}]overlay=enable='between(t,${card.at},${end})'[o${index}]`)
    chain = `[o${index}]`
  })
  const music = cut.music ? cut.cuts.length + cards.length : null
  await run([
    'ffmpeg',
    '-loglevel',
    'error',
    '-y',
    ...inputs,
    '-filter_complex',
    parts.join(';'),
    '-map',
    chain,
    ...(music === null
      ? ['-an']
      : [
          '-map',
          `${music}:a`,
          '-af',
          `afade=t=out:st=${total - 2.5}:d=2.5`,
          '-c:a',
          'aac',
          '-b:a',
          '256k',
        ]),
    '-t',
    String(total),
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '17',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    path,
  ])
}

await mkdir(clips, { recursive: true })
const needed = new Set(edit.cuts.map((each) => each.shot))
for (const shot of shots) {
  if (!needed.has(shot.name) && !only?.includes(shot.name)) continue
  const path = `${clips}/${shot.name}.mp4`
  if (existsSync(path) && !only?.includes(shot.name)) continue
  await renderClip(shot, path)
}
const name = option('edit') ?? 'look'
const music = option('music')
const master = `${out}/slow-voyage-${name}.mp4`
await assemble({ ...edit, music: music ? resolve(music) : edit.music }, master)
const social = `${out}/slow-voyage-${name}-social.mp4`
await run([
  'ffmpeg',
  '-loglevel',
  'error',
  '-y',
  '-i',
  master,
  '-c:v',
  'libx264',
  '-preset',
  'slow',
  '-crf',
  '20',
  '-maxrate',
  '18M',
  '-bufsize',
  '36M',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'copy',
  '-movflags',
  '+faststart',
  social,
])
console.log(`Trailer: ${master}`)
console.log(`For social posts: ${social}`)
