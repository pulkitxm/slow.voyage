import { type Browser, chromium, type Page } from 'playwright-core'
import { browserExecutable } from './browser'

export const mediaFps = 60
export const frameStep = 16
const clockStart = Date.UTC(2026, 5, 1)

export type View = [yaw: number, pitch: number, zoom: number]

export interface Scene {
  name: string
  hash: string
  settings: Record<string, unknown>
  camera?: 'chase' | 'bonnet' | 'cinematic'
  park?: { offset: number; turn: number }
  lead?: number
  ui?: boolean
}

interface Voyage {
  view: { yaw: number; pitch: number; zoom: number }
  physics: { x: number; s: number; yaw: number; speed: number }
  world: { road(s: number): { x: number; yaw: number } }
}

export function option(name: string) {
  const at = process.argv.indexOf(`--${name}`)
  return at < 0 ? undefined : process.argv[at + 1]
}

export async function openCapture(width: number, height: number, scale: number, fps = mediaFps) {
  const browser: Browser = await chromium.launch({
    executablePath: browserExecutable(),
    headless: true,
    args: [
      '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization',
      `--use-angle=${process.platform === 'darwin' ? 'metal' : 'vulkan'}`,
    ],
  })
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale })
  await page.clock.install({ time: clockStart })
  await page.clock.pauseAt(clockStart + 1000)
  await page.addInitScript((fps) => {
    const native = window.requestAnimationFrame.bind(window)
    const pace = window as unknown as { timeScale?: number }
    let time = 0
    let last = -1
    window.requestAnimationFrame = (callback) =>
      native((now) => {
        if (now !== last) {
          last = now
          time += (1000 / fps) * (pace.timeScale ?? 1)
        }
        callback(time)
      })
  }, fps)
  return { browser, page }
}

export async function advance(page: Page, frames: number) {
  for (let frame = 0; frame < frames; frame++) await page.clock.runFor(frameStep)
}

export async function stage(page: Page, base: string, scene: Scene) {
  const settings = {
    quality: 'ultra',
    volume: 0,
    life: 'lively',
    weather: 'clear',
    camera: scene.camera ?? 'chase',
    ...scene.settings,
  }
  await page.goto(`${base}#${scene.hash}`)
  await page.evaluate((value) => {
    localStorage.setItem('slow-voyage-settings', JSON.stringify(value))
    localStorage.setItem('slow-voyage-ultra', 'offered')
  }, settings)
  await page.goto(`${base}?scene=${scene.name}#${scene.hash}`)
  for (let wait = 0; wait < 900; wait++) {
    await page.clock.runFor(100)
    if (await page.locator('.intro .primary-button:not([disabled])').count()) break
  }
  await page.locator('.intro .primary-button').click()
  if (scene.park) {
    await advance(page, 60)
    await page.evaluate(({ offset, turn }) => {
      const voyage = (window as unknown as { voyage: Voyage }).voyage
      const road = voyage.world.road(voyage.physics.s)
      voyage.physics.x = road.x + offset * Math.cos(road.yaw)
      voyage.physics.s -= offset * Math.sin(road.yaw)
      voyage.physics.yaw = road.yaw + turn
      voyage.physics.speed = 0
    }, scene.park)
    await advance(page, 120)
  } else {
    await page.keyboard.press('f')
    await advance(page, scene.lead ?? 300)
  }
  if (!scene.ui) await page.addStyleTag({ content: overlayCss })
}

export async function aim(page: Page, view: View) {
  await page.evaluate(([yaw, pitch, zoom]) => {
    const camera = (window as unknown as { voyage: Voyage }).voyage.view
    camera.yaw = yaw
    camera.pitch = pitch
    camera.zoom = zoom
  }, view)
}

export const overlayHtml = {
  intro:
    '<div class="media-intro"><small>NO DESTINATION. NO HURRY</small><h1>A little further.<br>A little slower.</h1></div>',
  mark: '<div class="media-mark"><b>slow.voyage</b><small>TAKE THE LONG WAY HOME</small></div>',
  outro:
    '<div class="media-outro"><b>slow.voyage</b><small>TAKE THE LONG WAY HOME</small><p>An endless road, and all the time in the world.<br>Play free in your browser at slow.voyage</p></div>',
}

export async function overlay(page: Page, kind: keyof typeof overlayHtml, opacity: number) {
  await page.evaluate(
    ([html, alpha]) => {
      let layer = document.querySelector<HTMLElement>('.media-overlay')
      if (!layer) {
        layer = document.createElement('div')
        layer.className = 'media-overlay'
        document.querySelector('.drive')?.append(layer)
      }
      if (layer.dataset.html !== html) {
        layer.innerHTML = html
        layer.dataset.html = html
      }
      layer.style.opacity = String(alpha)
    },
    [overlayHtml[kind], opacity] as const,
  )
}

const overlayCss = `
.drive > :not(canvas):not(.media-overlay) { display: none !important; }
.media-overlay { position: fixed; inset: 0; pointer-events: none; font-family: "Manrope", "DM Sans", sans-serif; color: #f4f1ea; }
.media-intro { position: absolute; left: 6vw; bottom: 16vh; }
.media-intro small { display: flex; align-items: center; gap: 1.2vw; font: 500 0.75vw "DM Sans", sans-serif; letter-spacing: 0.35em; opacity: 0.85; }
.media-intro small::before { content: ""; width: 3vw; height: 1px; background: currentColor; }
.media-intro h1 { margin: 1.2vh 0 0; font-weight: 300; font-size: 4.6vw; line-height: 1.12; letter-spacing: -0.02em; text-shadow: 0 0.2vw 2vw rgba(0,0,0,0.25); }
.media-mark { position: absolute; right: 3vw; bottom: 3.4vh; text-align: center; }
.media-mark b { display: block; font-weight: 400; font-size: 1.15vw; letter-spacing: 0.12em; }
.media-mark small { display: block; font: 500 0.45vw "DM Sans", sans-serif; letter-spacing: 0.4em; opacity: 0.8; margin-top: 0.3vh; }
.media-outro { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; background: rgba(12, 20, 16, 0.62); }
.media-outro b { font-weight: 300; font-size: 5.2vw; letter-spacing: 0.14em; }
.media-outro small { font: 500 0.75vw "DM Sans", sans-serif; letter-spacing: 0.45em; margin-top: 1.4vh; opacity: 0.85; }
.media-outro p { font: 400 1vw/1.6 "DM Sans", sans-serif; margin-top: 4vh; opacity: 0.9; }
`

export async function run(command: string[]) {
  const child = Bun.spawn(command, { stdout: 'inherit', stderr: 'inherit' })
  if ((await child.exited) !== 0) throw new Error(`${command[0]} failed`)
}

type Span = number | [number, number]

export type Rig =
  | { kind: 'track'; ahead: Span; side: Span; height: Span; fov: Span; look?: number }
  | { kind: 'flyby'; ahead: number; side: number; height: number; fov: Span; look?: number }
  | { kind: 'orbit'; angle: Span; radius: Span; height: Span; fov: Span; look?: number }
  | {
      kind: 'scenery'
      ahead: number
      side: number
      height: Span
      travel: number
      turn: Span
      pitch: Span
      fov: Span
    }

export async function direct(page: Page, rig: Rig | null) {
  await page.evaluate((value) => {
    interface Point {
      x: number
      y: number
      z: number
    }
    interface Camera {
      position: Point & { set(x: number, y: number, z: number): void }
      fov: number
      lookAt(x: number, y: number, z: number): void
      updateProjectionMatrix(): void
    }
    interface Subject {
      x: number
      y: number
      s: number
    }
    interface Ground {
      road(s: number): { x: number; y: number; yaw: number }
      height(x: number, s: number): number
    }
    type Live = Rig & { t: number; anchor?: Point }
    const stage = window as unknown as {
      voyage: {
        view: {
          camera: Camera
          update(subject: Subject, world: Ground, mode: string, elapsed: number): void
          directed?: boolean
        }
      }
      rig: Live | null
    }
    stage.rig = value ? { ...value, t: 0 } : null
    const view = stage.voyage.view
    if (view.directed) return
    view.directed = true
    const original = view.update.bind(view)
    const at = (span: Span, t: number) =>
      typeof span === 'number' ? span : span[0] + (span[1] - span[0]) * t
    view.update = (subject, world, mode, elapsed) => {
      original(subject, world, mode, elapsed)
      const rig = stage.rig
      if (!rig) return
      const camera = view.camera
      const t = rig.t
      const road = world.road(subject.s)
      const forward = { x: -Math.sin(road.yaw), z: -Math.cos(road.yaw) }
      const side = { x: Math.cos(road.yaw), z: -Math.sin(road.yaw) }
      const car = { x: subject.x, y: subject.y, z: -subject.s }
      const ground = (x: number, z: number) => world.height(x, -z)
      let eye: Point
      let focus: Point
      if (rig.kind === 'track' || rig.kind === 'orbit') {
        const angle = rig.kind === 'orbit' ? at(rig.angle, t) : 0
        const reach = rig.kind === 'orbit' ? at(rig.radius, t) : 0
        const ahead = rig.kind === 'track' ? at(rig.ahead, t) : Math.cos(angle) * reach
        const across = rig.kind === 'track' ? at(rig.side, t) : Math.sin(angle) * reach
        const x = car.x + forward.x * ahead + side.x * across
        const z = car.z + forward.z * ahead + side.z * across
        eye = { x, y: Math.max(car.y + at(rig.height, t), ground(x, z) + 0.4), z }
        focus = { x: car.x, y: car.y + (rig.look ?? 0.7), z: car.z }
      } else if (rig.kind === 'flyby') {
        if (!rig.anchor) {
          const s = subject.s + rig.ahead
          const line = world.road(s)
          const x = line.x + Math.cos(line.yaw) * rig.side
          const z = -s - Math.sin(line.yaw) * rig.side
          rig.anchor = { x, y: ground(x, z) + rig.height, z }
        }
        eye = rig.anchor
        focus = { x: car.x, y: car.y + (rig.look ?? 0.7), z: car.z }
      } else {
        const s = subject.s + rig.ahead + rig.travel * t
        const line = world.road(s)
        const x = line.x + Math.cos(line.yaw) * rig.side
        const z = -s - Math.sin(line.yaw) * rig.side
        eye = { x, y: line.y + at(rig.height, t), z }
        const heading = line.yaw + at(rig.turn, t)
        const pitch = at(rig.pitch, t)
        focus = {
          x: x - Math.sin(heading) * Math.cos(pitch) * 100,
          y: eye.y + Math.sin(pitch) * 100,
          z: z - Math.cos(heading) * Math.cos(pitch) * 100,
        }
      }
      camera.position.set(eye.x, eye.y, eye.z)
      camera.lookAt(focus.x, focus.y, focus.z)
      camera.fov = at(rig.fov, t)
      camera.updateProjectionMatrix()
    }
  }, rig)
}

export async function cue(page: Page, t: number) {
  await page.evaluate((value) => {
    const stage = window as unknown as { rig: { t: number } | null }
    if (stage.rig) stage.rig.t = value
  }, t)
}

export async function pace(page: Page, scale: number) {
  await page.evaluate((value) => {
    ;(window as unknown as { timeScale: number }).timeScale = value
  }, scale)
}
