import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  advance,
  aim,
  narrow,
  openCapture,
  option,
  run,
  type Scene,
  stage,
  type View,
} from './media-capture'

interface Frame extends Scene {
  view: View
}

const frames: Frame[] = [
  {
    name: '01-highlands-golden-hour-touring-red-oncoming',
    hash: 'highlands-12@2.0',
    settings: {
      landscape: 'highlands',
      season: 'summer',
      daylight: 'sunset',
      vehicle: 'touring',
      color: '#a3211b',
    },
    view: [2.75, 0.02, 0.95],
  },
  {
    name: '02-desert-sunset-supercar-yellow-profile',
    hash: 'desert-4@2.0',
    settings: {
      landscape: 'desert',
      season: 'summer',
      daylight: 'sunset',
      vehicle: 'supercar',
      color: '#e0b21f',
    },
    view: [1.45, 0.06, 1.05],
  },
  {
    name: '03-desert-dusk-pickup-orange-parked-in-the-dunes',
    hash: 'desert-7@3.0',
    settings: {
      landscape: 'desert',
      season: 'summer',
      daylight: 'dusk',
      vehicle: 'pickup',
      color: '#d9772b',
    },
    view: [2.3, 0.14, 1.5],
    park: { offset: 14, turn: 0.7 },
  },
  {
    name: '04-alpine-winter-dawn-hatchback-blue-from-above',
    hash: 'alpine-3@1.0',
    settings: {
      landscape: 'alpine',
      season: 'winter',
      daylight: 'dawn',
      vehicle: 'hatchback',
      color: '#2f4f9e',
    },
    view: [2.45, 0.3, 2],
  },
  {
    name: '05-fjord-coast-roadster-cream-from-the-hill',
    hash: 'fjord-8@2.0',
    settings: {
      landscape: 'fjord',
      season: 'summer',
      daylight: 'day',
      vehicle: 'roadster',
      color: '#ece7dc',
    },
    view: [-0.9, 0.45, 3.2],
  },
  {
    name: '06-canyon-sunset-motorcycle-green-low',
    hash: 'canyon-5@3.0',
    settings: {
      landscape: 'canyon',
      season: 'summer',
      daylight: 'sunset',
      vehicle: 'motorcycle',
      color: '#1f6b3a',
    },
    view: [-1.75, -0.1, 1.1],
  },
  {
    name: '07-highlands-bus-mint-head-on',
    hash: 'highlands-21@3.0',
    settings: {
      landscape: 'highlands',
      season: 'summer',
      daylight: 'day',
      vehicle: 'bus',
      color: '#3f8f7a',
    },
    view: [3.14, 0.05, 1.3],
  },
  {
    name: '08-jungle-golden-hour-supercar-red-under-the-palms',
    hash: 'jungle-9@4.0',
    settings: {
      landscape: 'jungle',
      season: 'summer',
      daylight: 'sunset',
      vehicle: 'supercar',
      color: '#a3211b',
    },
    view: [2.5, 0.02, 0.9],
  },
  {
    name: '09-forest-night-touring-white-headlights',
    hash: 'forest-7@5.0',
    settings: {
      landscape: 'forest',
      season: 'summer',
      daylight: 'night',
      vehicle: 'touring',
      color: '#e9e9e4',
    },
    view: [2.6, 0.06, 1.1],
  },
  {
    name: '10-alpine-fog-roadster-cream-beams',
    hash: 'alpine-9@4.0',
    settings: {
      landscape: 'alpine',
      season: 'autumn',
      daylight: 'day',
      weather: 'fog',
      vehicle: 'roadster',
      color: '#ece7dc',
    },
    view: [2.9, 0.1, 1.2],
  },
  {
    name: '11-highlands-autumn-dusk-supercar-violet-low-front',
    hash: 'highlands-44@5.0',
    settings: {
      landscape: 'highlands',
      season: 'autumn',
      daylight: 'dusk',
      vehicle: 'supercar',
      color: '#5b2a9e',
    },
    view: [2.45, -0.1, 0.8],
  },
  {
    name: '12-forest-winter-pickup-green-among-the-firs',
    hash: 'forest-11@2.0',
    settings: {
      landscape: 'forest',
      season: 'winter',
      daylight: 'day',
      vehicle: 'pickup',
      color: '#3f5f45',
    },
    view: [-2.2, 0.22, 2.4],
    park: { offset: -12, turn: -0.5 },
  },
  {
    name: '13-jungle-hatchback-yellow-under-the-palms',
    hash: 'jungle-3@2.0',
    settings: {
      landscape: 'jungle',
      season: 'summer',
      daylight: 'day',
      vehicle: 'hatchback',
      color: '#e3c22a',
    },
    view: [2.6, 0.5, 2.6],
  },
  {
    name: '14-canyon-dusk-touring-blue-headlights',
    hash: 'canyon-8@6.0',
    settings: {
      landscape: 'canyon',
      season: 'summer',
      daylight: 'dusk',
      vehicle: 'touring',
      color: '#2f4f9e',
    },
    view: [2.6, 0.06, 1],
  },
  {
    name: '15-fjord-sunset-roadster-red-cinematic',
    hash: 'fjord-2@6.0',
    settings: {
      landscape: 'fjord',
      season: 'summer',
      daylight: 'sunset',
      vehicle: 'roadster',
      color: '#a3211b',
    },
    view: [0, 0, 1],
    camera: 'cinematic',
    lead: 420,
  },
  {
    name: '16-highlands-autumn-supercar-white-parked-by-the-lake',
    hash: 'highlands-12@2.0',
    settings: {
      landscape: 'highlands',
      season: 'autumn',
      daylight: 'day',
      vehicle: 'supercar',
      color: '#f1efe9',
    },
    view: [-0.9, 0.12, 1.6],
    park: { offset: 9, turn: -0.9 },
  },
]

const panels = Math.min(10, Math.max(2, Number(option('panels') ?? 10)))
const panelHeight = Math.max(512, Number(option('panel-height') ?? 1536))
const panelAspect = panels / 2
const carouselView = option('carousel-view')?.split(',').map(Number) as View | undefined
const carousel: Frame = {
  name: '08-jungle-golden-hour-supercar-yellow-full',
  hash: 'jungle-9@4.0',
  settings: {
    landscape: 'jungle',
    season: 'summer',
    daylight: 'sunset',
    vehicle: 'supercar',
    color: '#ffd400',
  },
  view: carouselView ?? (panels > 4 ? [2.15, 0.04, 2.6] : [2.72, 0.02, 1]),
}
const carouselFov = Math.min(
  68,
  (2 * Math.atan(Math.tan((50 * Math.PI) / 180) / panelAspect) * 180) / Math.PI,
)

const base = option('url') ?? 'http://127.0.0.1:3002/'
const out = resolve(option('out') ?? '.review/launch')
const only = option('only')?.split(',')

async function shoot(
  list: Frame[],
  directory: string,
  width: number,
  height: number,
  scale: number,
  fov?: number,
) {
  await mkdir(directory, { recursive: true })
  const { browser, page } = await openCapture(width, height, scale)
  try {
    for (const frame of list) {
      await stage(page, base, frame)
      await aim(page, frame.view)
      await advance(page, 45)
      if (fov && fov < 68) {
        await narrow(page, fov)
        await advance(page, 1)
      }
      const canvas = await page.evaluate(() => {
        const element = document.querySelector('canvas')
        return `${element?.width}x${element?.height}`
      })
      await page.screenshot({ path: `${directory}/${frame.name}.png` })
      console.log(`canvas ${canvas}`)
      console.log(`frame ${frame.name}`)
    }
  } finally {
    await browser.close()
  }
}

const chosen = frames.filter(
  (frame) => !only || only.some((prefix) => frame.name.startsWith(prefix)),
)
if (!process.argv.includes('--carousel-only')) await shoot(chosen, `${out}/frames`, 1920, 1080, 2)
if (!only) {
  const directory = `${out}/carousel`
  await shoot([carousel], directory, (panels * panelHeight) / 2, panelHeight, 2, carouselFov)
  for (let panel = 0; panel < panels; panel++)
    await run([
      'ffmpeg',
      '-loglevel',
      'error',
      '-y',
      '-i',
      `${directory}/${carousel.name}.png`,
      '-vf',
      `crop=${panelHeight}:${panelHeight * 2}:${panel * panelHeight}:0`,
      `${directory}/08-carousel-${String(panel + 1).padStart(2, '0')}-of-${panels}.png`,
    ])
}
console.log(`Launch frames: ${out}`)
