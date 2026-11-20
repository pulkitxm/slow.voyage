import * as THREE from 'three'
import { Atmosphere, atmosphereProfile, sunOffset } from './atmosphere'
import { DriveAudio } from './audio'
import { DrivingCamera } from './camera'
import { Cast } from './cast'
import { CinematicPipeline } from './cinema'
import { footprints } from './collision'
import {
  automaticTarget,
  mergeManualInput,
  neutralInput,
  releaseAssistance,
  resolveInput,
} from './controls'
import { SceneCrossfade } from './crossfade'
import { type ControllerLook, type ControllerStatus, GamepadControls } from './gamepad'
import { cinemaRelief, createGraphicsRenderer, frameStrained, graphicsBudget } from './graphics'
import { type LandmarkKind, landmarkLayout, landmarkOffset, lapLandmarks } from './landmarks'
import { landscapeProfiles } from './landscapes'
import { LapClock } from './laps'
import { Life } from './life'
import { lapState, Minimap, roadGuide } from './minimap'
import {
  arrivalPose,
  createVehicleModel,
  positionVehicle,
  type VehicleModel,
  vehicleArrival,
} from './model'
import { MouseControls } from './mouse'
import { CarPhysics, type Input, type Telemetry } from './physics'
import { Precipitation } from './precipitation'
import { puddleLevel } from './road-condition'
import { SimulationClock } from './simulation-clock'
import { ScenicSky } from './sky'
import { SoftwareAntialias } from './software-antialias'
import { Terrain } from './terrain'
import { SkidMarks, TyreParticles, trailLayout } from './tyre-trail'
import { vehicleMetrics } from './vehicles'
import { Wake, wakeStrength } from './wake'
import { Water } from './water'
import { type AssistanceMode, clamp, defaults, type Settings, World } from './world'
import { WorldMap } from './world-map'

const impactShake = { pitch: 0.025, roll: 0.035 }
const paintBudget = 11
const paintDepth = 0.86
export const contactShade = { opacity: 0.5, margin: 1.25, lift: 0.045 }

function contactShadow() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d')
  if (context) {
    const fade = context.createRadialGradient(32, 32, 6, 32, 32, 32)
    fade.addColorStop(0, 'rgba(0, 0, 0, 1)')
    fade.addColorStop(0.55, 'rgba(0, 0, 0, 0.62)')
    fade.addColorStop(1, 'rgba(0, 0, 0, 0)')
    context.fillStyle = fade
    context.fillRect(0, 0, 64, 64)
  }
  const geometry = new THREE.PlaneGeometry(1, 1)
  geometry.rotateX(-Math.PI / 2)
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      color: '#000000',
      transparent: true,
      opacity: contactShade.opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      fog: false,
    }),
  )
  mesh.renderOrder = 1
  return mesh
}
export const lightingPace = { step: 0.5, reflection: 6 }
export const stormFlash = { shortest: 5, longest: 14, strength: 9, decay: 7 }

export interface DriveState extends Telemetry {
  assistance: AssistanceMode
  paused: boolean
  fps: number
  controller: ControllerStatus
  mouseSteering: number
  lap: number
  lapDistance: number
  roadDistance: number
  lapTime: number | null
  lastLap: number | null
  bestLap: number | null
  photo: boolean
  found: number
  landmarks: number
}
export class RoadEngine {
  renderer: THREE.WebGLRenderer
  antialiasing: SoftwareAntialias | null
  cinema: CinematicPipeline | null = null
  cinemaStrain = 0
  framePace = 1 / 60
  frameJitter = 0
  dayClock = 0
  lifeClock = 0
  life: Life | null = null
  cast: Cast | null = null
  contact = contactShadow()
  tyreClouds = new TyreParticles()
  skids = new SkidMarks()
  wake: Wake | null = null
  wetRoad = false
  private dustTone = new THREE.Color()
  private travel = new THREE.Vector3()
  private skyTone = new THREE.Color()
  private cloudTone = new THREE.Color()
  private cloudPlace = new THREE.Vector3()
  private cloudDrift = new THREE.Vector3()
  laps = new LapClock()
  photo = false
  onLap?: (time: number, record: boolean) => void
  onProgress?: (fraction: number, stage: 'stone' | 'hills' | 'light') => void
  software = false
  renderScale = 0
  onDiscover?: (kind: LandmarkKind, found: number, total: number) => void
  lightingAt = 0
  reflectionAt = Number.NEGATIVE_INFINITY
  dark = false
  lightning = { next: 6, flash: 0, base: 0 }
  cinemaBlocked = false
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(68, 1, 0.1, 3600)
  settings: Settings
  world: World
  physics: CarPhysics
  minimap: Minimap
  atlas: WorldMap
  water: Water
  terrain: Terrain
  car: VehicleModel
  audio = new DriveAudio()
  atmosphere: Atmosphere
  precipitation: Precipitation
  sun = new THREE.DirectionalLight('#fff3d5', 2.5)
  ambient = new THREE.HemisphereLight('#dae9ec', '#9ba47c', 1.9)
  headlights: THREE.SpotLight[] = []
  sky: ScenicSky
  frame = 0
  arrival = vehicleArrival.duration
  sunHeight = 110
  started = false
  paused = false
  assistance: AssistanceMode = 'off'
  controlsBlocked = false
  keys = new Set<string>()
  touch: Input = { ...neutralInput }
  controller = new GamepadControls()
  controllerInput: Input = { ...neutralInput }
  controllerLook: ControllerLook = { x: 0, y: 0, zoom: 0 }
  controllerStatus: ControllerStatus = 'none'
  mouse = new MouseControls()
  lookPointer: number | null = null
  lookButton = 0
  lastTime = 0
  simulation = new SimulationClock()
  lastTelemetry = 0
  view = new DrivingCamera(this.camera)
  disposed = false
  crossfade: SceneCrossfade
  rendered = false
  frameRate = 60
  onState?: (state: DriveState) => void
  onError?: () => void
  onAction?: (
    action:
      | 'pause'
      | 'auto'
      | 'camera'
      | 'help'
      | 'autoMode'
      | 'cruiseUp'
      | 'cruiseDown'
      | 'mouse'
      | 'mute'
      | 'journeyNext'
      | 'journeyPrevious'
      | 'vehicleNext'
      | 'vehiclePrevious'
      | 'photo'
      | 'map',
  ) => void
  resize = () => {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
  }
  keyDown = (event: KeyboardEvent) => {
    if (!this.rendered) return
    if (this.photo) {
      if (['Escape', 'KeyT'].includes(event.code)) this.onAction?.('photo')
      if (['Enter', 'Space'].includes(event.code)) this.screenshot()
      if (['Escape', 'Space', 'Enter'].includes(event.code)) event.preventDefault()
      return
    }
    if (this.controlsBlocked || document.querySelector('dialog[open]')) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (
      event.target instanceof HTMLElement &&
      ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)
    )
      return
    if (event.target instanceof HTMLButtonElement && ['Space', 'Enter'].includes(event.code)) return
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Escape'].includes(event.code))
      event.preventDefault()
    if (event.repeat) return
    this.keys.add(event.code)
    if (!this.started && ['KeyW', 'ArrowUp'].includes(event.code)) this.start()
    if (['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown'].includes(event.code)) this.manualOverride('speed')
    if (['ShiftLeft', 'ShiftRight'].includes(event.code) && this.manualInput().throttle > 0)
      this.manualOverride('speed')
    if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(event.code))
      this.manualOverride('steer')
    if (event.code === 'Space') this.manualOverride('all')
    if (event.code === 'KeyF') this.onAction?.('auto')
    if (event.code === 'KeyG') this.onAction?.('autoMode')
    if (event.code === 'KeyM') this.onAction?.('mute')
    if (event.code === 'KeyU') this.onAction?.('mouse')
    if (event.code === 'KeyQ') this.onAction?.('journeyPrevious')
    if (event.code === 'KeyE') this.onAction?.('journeyNext')
    if (event.code === 'KeyV') this.onAction?.(event.shiftKey ? 'vehiclePrevious' : 'vehicleNext')
    if (['Equal', 'NumpadAdd'].includes(event.code)) this.onAction?.('cruiseUp')
    if (['Minus', 'NumpadSubtract'].includes(event.code)) this.onAction?.('cruiseDown')
    if (event.code === 'KeyP' || event.code === 'Escape') this.onAction?.('pause')
    if (event.code === 'KeyC') this.onAction?.('camera')
    if (event.code === 'KeyH') this.onAction?.('help')
    if (event.code === 'KeyR') this.reset()
    if (event.code === 'KeyT' && this.started) this.onAction?.('photo')
    if (event.code === 'KeyN' && this.started) this.onAction?.('map')
    if (event.code === 'KeyB') this.audio.hornHeld = this.started
    if (event.code === 'KeyX') this.view.rear = this.started
  }
  keyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code)
    if (event.code === 'KeyB') this.audio.hornHeld = false
    if (event.code === 'KeyX') this.view.rear = false
  }
  blur = () => {
    this.keys.clear()
    this.touch = { ...neutralInput }
    this.controllerInput = { ...neutralInput }
    this.controllerLook = { x: 0, y: 0, zoom: 0 }
    this.physics.boosting = false
    this.audio.hornHeld = false
    this.view.rear = false
    this.controller.suspend()
    this.mouse.reset()
    this.physics.steeringControl.releaseInput()
    this.cancelLook()
  }
  visibility = () => {
    this.lastTime = 0
    this.simulation.reset()
    if (document.hidden) this.blur()
  }
  pointerMove = (event: PointerEvent) => {
    if (this.controlsBlocked || this.paused) return
    if (this.settings.mouseEnabled && event.pointerType === 'mouse') {
      this.mouse.setButtons(event.buttons)
      if (this.lookPointer === null && (event.buttons & 4) !== 0) this.beginLook(event, 4)
    }
    if (this.lookPointer === event.pointerId) {
      if (event.pointerType === 'mouse' && (event.buttons & this.lookButton) === 0) {
        this.cancelLook()
        return
      }
      const area = this.canvas.getBoundingClientRect()
      this.view.moveDrag(event.pointerId, event.clientX, event.clientY, area.width, area.height)
      event.preventDefault()
      return
    }
    if (
      !this.settings.mouseEnabled ||
      this.controlsBlocked ||
      this.paused ||
      event.pointerType !== 'mouse'
    )
      return
    const area = this.canvas.getBoundingClientRect()
    if (this.mouse.move(event.clientX - area.left, area.width, this.settings.mouseSensitivity))
      this.manualOverride('steer')
  }
  pointerDown = (event: PointerEvent) => {
    if (this.controlsBlocked || this.paused || !this.rendered) return
    if (
      this.started &&
      (event.pointerType !== 'mouse' ||
        event.button === 1 ||
        (!this.settings.mouseEnabled && [0, 2].includes(event.button))) &&
      this.beginLook(event, event.button === 1 ? 4 : event.button === 2 ? 2 : 1)
    ) {
      event.preventDefault()
      return
    }
    if (
      !this.settings.mouseEnabled ||
      this.controlsBlocked ||
      this.paused ||
      event.pointerType !== 'mouse' ||
      ![0, 2].includes(event.button)
    )
      return
    this.pointerMove(event)
    this.mouse.setButtons(event.buttons)
    this.canvas.setPointerCapture(event.pointerId)
    if (!this.started) this.start()
    this.manualOverride('speed')
    event.preventDefault()
  }
  pointerUp = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') this.mouse.setButtons(event.buttons)
    if (this.lookPointer === event.pointerId) this.cancelLook()
  }
  beginLook = (event: PointerEvent, button: number) => {
    if (
      !this.started ||
      !this.view.beginDrag(event.pointerId, event.clientX, event.clientY, this.settings.camera)
    )
      return false
    this.lookPointer = event.pointerId
    this.lookButton = button
    this.canvas.setPointerCapture(event.pointerId)
    return true
  }
  cancelLook = () => {
    const pointer = this.lookPointer
    this.lookPointer = null
    this.lookButton = 0
    this.view.cancelDrag()
    if (pointer !== null && !this.mouse.buttons && this.canvas.hasPointerCapture(pointer))
      this.canvas.releasePointerCapture(pointer)
  }
  pointerCancel = () => {
    this.mouse.reset()
    this.cancelLook()
  }
  pointerLeave = () => {
    if (!this.mouse.buttons) this.mouse.reset()
  }
  contextMenu = (event: Event) => {
    if (this.started && !this.controlsBlocked) event.preventDefault()
  }
  cameraWheel = (event: WheelEvent) => {
    if (!this.started || this.controlsBlocked || this.paused) return
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.canvas.clientHeight : 1
    if (this.view.scroll(event.deltaY * scale, this.settings.camera)) event.preventDefault()
  }
  cameraCenter = () => {
    if (this.started && !this.controlsBlocked && !this.settings.mouseEnabled) this.view.center()
  }
  constructor(
    public canvas: HTMLCanvasElement,
    settings: Settings = defaults,
  ) {
    this.settings = { ...settings }
    this.world = new World(this.settings)
    this.physics = new CarPhysics(this.world)
    this.minimap = new Minimap(this.world)
    this.atlas = new WorldMap(this.world)
    this.atlas.found = this.minimap.found
    this.crossfade = new SceneCrossfade(canvas)
    this.renderer = createGraphicsRenderer(canvas)
    const budget = graphicsBudget(this.renderer, this.settings.quality)
    this.antialiasing = budget.software ? new SoftwareAntialias() : null
    this.software = budget.software
    this.renderer.setPixelRatio(this.pixelRatio(budget))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.1
    this.scene.fog = new THREE.FogExp2('#d3ddd2', 0.00095)
    this.scene.add(this.ambient, this.sun, this.sun.target)
    this.sun.castShadow = true
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -75
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 75
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 350
    this.configureShadows(budget)
    this.sky = new ScenicSky()
    this.scene.add(this.sky)
    this.water = new Water(this.scene)
    this.terrain = new Terrain(this.scene, this.world, budget.detail, budget.software)
    if (!budget.software) {
      this.life = new Life(this.world)
      this.cast = new Cast()
      this.life.stage = this.cast
      this.scene.add(this.life.group, this.cast.group)
    }
    const terrain = this.terrain
    const life = this.life
    this.physics.trunks = function* (s) {
      yield* terrain.trunksNear(s)
      if (life) yield* life.obstacles(s)
    }
    this.atmosphere = new Atmosphere(this.renderer)
    this.precipitation = new Precipitation(this.scene)
    this.car = createVehicleModel(this.settings, budget.software)
    this.car.body.color.set(this.settings.color).multiplyScalar(paintDepth)
    this.scene.add(this.car.group, this.contact)
    if (!budget.software) {
      this.wake = new Wake(this.terrain.grassMaterial.fieldUniforms.fieldNoiseMap)
      this.scene.add(this.tyreClouds.points, this.skids.mesh, this.wake.group)
    }
    this.configureHeadlights()
    this.applyLighting()
    this.configureCinema(budget)
    this.resize()
    window.addEventListener('resize', this.resize)
    window.addEventListener('keydown', this.keyDown)
    window.addEventListener('keyup', this.keyUp)
    window.addEventListener('blur', this.blur)
    document.addEventListener('visibilitychange', this.visibility)
    canvas.addEventListener('pointermove', this.pointerMove)
    canvas.addEventListener('pointerdown', this.pointerDown)
    canvas.addEventListener('pointerup', this.pointerUp)
    canvas.addEventListener('pointercancel', this.pointerCancel)
    canvas.addEventListener('pointerleave', this.pointerLeave)
    canvas.addEventListener('contextmenu', this.contextMenu)
    canvas.addEventListener('wheel', this.cameraWheel, { passive: false })
    canvas.addEventListener('dblclick', this.cameraCenter)
    canvas.addEventListener('lostpointercapture', this.pointerCancel)
    void this.prepare().catch(() => {
      if (!this.disposed) this.onError?.()
    })
  }
  async prepare() {
    this.canvas.style.visibility = 'hidden'
    this.onProgress?.(0.04, 'stone')
    await this.terrain.grassMaterial.rock.ready
    if (this.disposed) return
    const p = this.physics
    await this.paint()
    if (this.disposed) return
    this.terrain.update(p.s, 0, p.s, p.x)
    this.car.group.position.set(p.x, p.y, -p.s)
    this.camera.position.set(p.x, p.y + 5, -p.s + 12)
    this.camera.lookAt(p.x, p.y + 1, -p.s)
    this.sky.position.copy(this.camera.position)
    this.water.update(p.x, p.s, 0)
    this.precipitation.update(this.camera, this.canvas.height, 0, this.travel)
    this.sun.position.set(p.x + sunOffset.x, p.y + this.sunHeight, -p.s + sunOffset.z)
    this.sun.target.position.set(p.x, p.y, -p.s - 15)
    this.precipitation.rain.visible = this.precipitation.snow.visible = true
    if (this.cinema) {
      this.cinema.resize()
      this.renderer.setRenderTarget(this.cinema.scene)
    }
    this.onProgress?.(0.9, 'light')
    await this.renderer.compileAsync(this.scene, this.camera)
    this.renderer.setRenderTarget(null)
    if (this.disposed) return
    this.onProgress?.(1, 'light')
    this.drawScene()
    this.renderer.getContext().finish()
    this.precipitation.setAppearance(this.settings, atmosphereProfile(this.settings, this.dayClock))
    if (!this.disposed) this.frame = requestAnimationFrame(this.render)
  }
  paint() {
    return new Promise<void>((resolve) => {
      const stroke = () => {
        if (this.disposed) return resolve()
        const painted = this.software ? 1 : this.terrain.prime(this.physics.s, paintBudget)
        this.onProgress?.(0.1 + painted * 0.78, 'hills')
        if (painted >= 1) resolve()
        else requestAnimationFrame(stroke)
      }
      stroke()
    })
  }
  start(assistance: AssistanceMode = 'off') {
    this.started = true
    this.assistance = assistance
    this.paused = false
    this.laps.reset(this.physics.s)
    this.audio.start(this.settings.volume)
    this.physics.distance = 0
    if (assistance === 'off' || assistance === 'steer') this.physics.speed = 0
    this.emitState()
  }
  setAssistance(mode: AssistanceMode) {
    if (!this.started && mode !== 'off') this.start(mode)
    else {
      this.assistance = mode
      this.emitState()
    }
  }
  manualOverride(axis: 'steer' | 'speed' | 'all') {
    const next = releaseAssistance(this.assistance, axis)
    if (next !== this.assistance) this.setAssistance(next)
  }
  setPaused(paused: boolean) {
    if (!this.started) return
    this.paused = paused
    this.blur()
    this.emitState()
  }
  setControlsBlocked(blocked: boolean) {
    this.controlsBlocked = blocked
    if (blocked) this.blur()
  }
  setTouch(key: 'throttle' | 'brake' | 'steer' | 'boost', value: number) {
    if (this.controlsBlocked) return
    if (key === 'boost') this.touch.boost = value > 0
    else this.touch[key] = value
    if (key === 'steer') this.touch.steeringSource = value ? 'digital' : null
    if (value && (key !== 'boost' || this.touch.throttle > 0))
      this.manualOverride(key === 'steer' ? 'steer' : 'speed')
  }
  emitState() {
    if (!this.rendered) return
    const lap = lapState(this.physics.s)
    const landmarks = lapLandmarks(this.world)
    const found = this.minimap.found
    if (this.started)
      for (const landmark of landmarks) {
        if (found.has(landmark.id)) continue
        const offset = landmarkOffset(landmark, this.physics.x, this.physics.s)
        if (Math.hypot(offset.x, offset.s) > landmarkLayout.found) continue
        found.add(landmark.id)
        this.onDiscover?.(landmark.kind, found.size, landmarks.length)
      }
    this.onState?.({
      ...this.physics.telemetry(),
      lap: lap.lap,
      lapDistance: lap.distance,
      roadDistance: roadGuide(this.world, this.physics).distance,
      lapTime: this.laps.timed ? this.laps.time : null,
      lastLap: this.laps.last,
      bestLap: this.laps.best,
      photo: this.photo,
      found: found.size,
      landmarks: landmarks.length,
      assistance: this.assistance,
      paused: this.paused,
      fps: this.frameRate,
      controller: this.controllerStatus,
      mouseSteering: this.mouse.steer,
    })
  }
  setPhoto(photo: boolean) {
    if (!this.started || this.paused) return
    this.photo = photo
    this.blur()
    this.emitState()
  }
  travelTo(s: number) {
    this.physics.reset(s)
    this.laps.reset(s)
    this.view.center()
    this.view.snap()
  }
  reset() {
    this.mouse.reset()
    this.physics.reset()
    this.view.center()
    this.view.snap()
  }
  setSettings(settings: Settings) {
    const budget = graphicsBudget(this.renderer, settings.quality)
    const roadChange =
      settings.landscape !== this.settings.landscape || settings.seed !== this.settings.seed
    const refresh =
      settings.season !== this.settings.season ||
      settings.landscape !== this.settings.landscape ||
      settings.quality !== this.settings.quality ||
      settings.seed !== this.settings.seed
    const vehicleChange = settings.vehicle !== this.settings.vehicle
    const assistanceChange = settings.autodriveMode !== this.settings.autodriveMode
    const mouseChange = settings.mouseEnabled !== this.settings.mouseEnabled
    const cameraChange = settings.camera !== this.settings.camera
    const environmentChange =
      refresh ||
      settings.daylight !== this.settings.daylight ||
      settings.weather !== this.settings.weather
    if (environmentChange && this.rendered) this.crossfade.capture()
    if (environmentChange) this.minimap.invalidate()
    this.settings = { ...settings }
    this.world.settings = this.settings
    if (roadChange || vehicleChange) this.laps.reset(this.physics.s)
    if (roadChange) this.minimap.found.clear()
    if (roadChange) this.skids.clear()
    if (roadChange) {
      const speed = this.physics.speed
      this.physics.reset()
      this.physics.speed = speed
      this.view.snap()
    }
    if (mouseChange || cameraChange) {
      this.mouse.reset()
      this.physics.steeringControl.releaseInput()
      this.cancelLook()
    }
    if (refresh) this.terrain.refresh(this.settings, budget.detail)
    if (vehicleChange) {
      this.scene.remove(this.car.group)
      this.car.dispose()
      this.car = createVehicleModel(this.settings, budget.software)
      this.scene.add(this.car.group)
      this.configureHeadlights()
      this.arrival = 0
      this.view.snap()
      this.physics.suspension.configure(settings.vehicle)
      this.physics.suspension.reset(this.physics)
    }
    this.car.body.color.set(settings.color).multiplyScalar(paintDepth)
    this.renderer.setPixelRatio(this.pixelRatio(budget))
    this.configureCinema(budget)
    this.configureShadows(budget)
    this.applyLighting()
    if (assistanceChange && this.assistance !== 'off') this.setAssistance(settings.autodriveMode)
  }
  pixelRatio(budget: ReturnType<typeof graphicsBudget>) {
    return budget.pixelRatio * (cinemaRelief.scales[this.renderScale] ?? 1)
  }
  configureCinema(budget: ReturnType<typeof graphicsBudget>) {
    const cinematic = budget.cinematic && !this.cinemaBlocked
    if (cinematic && !this.cinema) this.cinema = new CinematicPipeline(this.renderer)
    if (!cinematic && this.cinema) {
      this.cinema.dispose()
      this.cinema = null
    }
    const solid = this.sky.material.uniforms.solid
    if (solid) solid.value = this.cinema ? 0 : 1
  }
  configureShadows(budget: ReturnType<typeof graphicsBudget>) {
    const shadow = this.sun.shadow
    shadow.radius = budget.shadowRadius
    shadow.bias = budget.shadowBias
    shadow.normalBias = budget.shadowNormalBias
    if (shadow.mapSize.x !== budget.shadowSize) {
      shadow.mapSize.set(budget.shadowSize, budget.shadowSize)
      shadow.map?.dispose()
      shadow.map = null
    }
  }
  configureHeadlights() {
    if (!this.headlights.length)
      this.headlights = Array.from(
        { length: 2 },
        () => new THREE.SpotLight('#fff3df', 40, 120, 0.34, 0.95, 1.2),
      )
    for (const [index, light] of this.headlights.entries()) {
      const position = this.car.headlightPositions[index] ??
        this.car.headlightPositions[0] ?? [0, 0, 0]
      light.position.set(...position)
      light.target.position.set(position[0] * 1.3, -0.9, position[2] - 34)
      this.car.group.add(light, light.target)
    }
  }
  applyLighting(drifting = false) {
    const profile = atmosphereProfile(this.settings, this.dayClock)
    this.water.setAppearance(this.settings.season === 'winter', profile)
    this.sunHeight = profile.sunHeight
    if (!drifting || this.dayClock - this.reflectionAt >= lightingPace.reflection) {
      this.reflectionAt = this.dayClock
      const environment = this.atmosphere.setAppearance(this.settings, profile)
      this.scene.environment = environment
      this.scene.environmentIntensity = 0.35
      this.car.group.traverse((object) => {
        if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshPhysicalMaterial) {
          object.material.envMap = environment
        }
      })
      this.terrain.roadMaterial.envMap = environment
    }
    this.precipitation.setAppearance(this.settings, profile)
    const night = profile.night > 0.5
    this.dark = night
    this.wetRoad = profile.wet
    this.tyreClouds.setLight(
      clamp((profile.sunlight / 2.5) * 0.55 + (profile.ambient / 2.6) * 0.45, 0.08, 1) ** 1.7,
    )
    this.wake?.setLight(
      clamp((profile.sunlight / 2.5) * 0.55 + (profile.ambient / 2.6) * 0.45, 0.08, 1) ** 1.4,
    )
    this.dustTone.set(
      this.settings.season === 'winter'
        ? '#eef1f0'
        : (landscapeProfiles[this.settings.landscape].ground?.light ?? '#b9ad8a'),
    )
    this.terrain.setNight(night)
    this.minimap.dim = clamp(0.3 + (profile.ambient / 2.6) * 0.7, 0.5, 1)
    this.atlas.dim = this.minimap.dim
    this.lightning.base = profile.ambient * 0.3
    this.sky.setAppearance(profile)
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.set(profile.horizon)
      this.scene.fog.density = profile.fog
    }
    this.sun.color.set(profile.sun)
    this.sun.intensity = profile.sunlight
    this.ambient.intensity = profile.ambient * 0.3
    this.ambient.color.set(profile.horizon)
    this.ambient.groundColor.set(this.settings.season === 'winter' ? '#a7b9c8' : '#5c6c47')
    this.renderer.toneMappingExposure = profile.exposure
    this.terrain.roadWetness.value = profile.wet ? 1 : 0
    this.terrain.roadSurface.setCondition(
      this.settings.roadWear,
      profile.wet ? puddleLevel(this.settings.weather) : 2,
      profile.wet,
      this.settings.season === 'winter'
        ? '#b9bcb8'
        : (landscapeProfiles[this.settings.landscape].field?.soil ?? '#7d6a4f'),
      this.skyTone.set(profile.horizon).multiplyScalar(clamp(profile.ambient / 2.6, 0.12, 1) * 0.9),
    )
    this.terrain.roadMaterial.color.set(profile.wet ? '#a8b4bd' : '#c4ccd1')
    this.terrain.roadMaterial.envMapIntensity = profile.wet ? 0.8 : 0.2
    for (const [index, light] of this.headlights.entries())
      light.intensity =
        index < this.car.headlightPositions.length &&
        (night || profile.wet || profile.snow || this.settings.weather === 'fog')
          ? 210 * (night ? 1 : clamp(1 - profile.sunlight * 0.6 - profile.ambient * 0.25, 0.08, 1))
          : 0
  }
  advanceSky(dt: number) {
    this.dayClock += dt
    if (
      this.settings.daylight === 'cycle' &&
      this.dayClock - this.lightingAt >= lightingPace.step
    ) {
      this.lightingAt = this.dayClock
      this.applyLighting(true)
    }
    const flash = this.lightning
    if (this.settings.weather !== 'storm') {
      flash.flash = 0
      return
    }
    flash.next -= dt
    if (flash.next <= 0) {
      flash.next = stormFlash.shortest + Math.random() * (stormFlash.longest - stormFlash.shortest)
      flash.flash = 1
      this.audio.thunder(0.4 + Math.random() * 1.8)
    }
    flash.flash = Math.max(0, flash.flash - dt * stormFlash.decay * (0.4 + Math.random()))
    this.ambient.intensity = flash.base * (1 + flash.flash * stormFlash.strength)
  }
  trailTyres(dt: number, seconds: number) {
    const p = this.physics
    const speed = Math.abs(p.speed)
    const active = this.started && !this.paused && !this.photo
    for (const [index, wheel] of p.suspension.wheels.entries()) {
      const sliding =
        active && wheel.contact && wheel.onRoad && wheel.slip > trailLayout.markSlip && speed > 3
      this.skids.trace(index, sliding, wheel.x, wheel.ground + 0.03, -wheel.s)
      if (!active || !wheel.contact || speed < 4) continue
      let rate = 0
      let opacity = 0.3
      let size = 1.3
      if (p.wading > 0) {
        rate = Math.min(speed, 20) * 2.2
        opacity = 0.36
        size = 1.7
        this.cloudTone.set('#e4eef2')
      } else if (!wheel.onRoad) {
        rate = Math.min(speed, 30) * 1.3
        opacity = 0.44
        size = 2
        this.cloudTone.copy(this.dustTone)
      } else if (wheel.slip > trailLayout.smokeSlip) {
        rate = 26 * wheel.slip
        this.cloudTone.set('#dfe3e3')
      } else if (this.wetRoad && speed > 10) {
        const pooled = wheel.puddle
        rate = speed * (1.6 + pooled * 2.4)
        opacity = 0.09 + pooled * 0.06
        size = 2.6 + pooled * 1.4
        this.cloudTone.set('#c9d6dc')
      }
      if (Math.random() >= rate * dt) continue
      this.cloudPlace.set(wheel.x, wheel.ground + 0.15, -wheel.s)
      this.cloudDrift.set(
        (Math.random() - 0.5) * 1.4 - Math.sin(p.yaw) * p.speed * 0.12,
        0.5 + Math.random() * 0.8,
        (Math.random() - 0.5) * 1.4 - Math.cos(p.yaw) * p.speed * 0.12,
      )
      this.tyreClouds.emit(this.cloudPlace, this.cloudDrift, this.cloudTone, opacity, size, seconds)
    }
    this.tyreClouds.update(seconds, this.canvas.height)
    if (this.wake) {
      const rear = p.suspension.wheels.filter(
        (wheel) => !wheel.front || p.suspension.wheels.length <= 2,
      )
      let x = 0
      let ground = 0
      let s = 0
      let level = 0
      for (const wheel of rear) {
        x += wheel.x / rear.length
        ground += wheel.ground / rear.length
        s += wheel.s / rear.length
        if (active && wheel.contact)
          level += wakeStrength(p.speed, this.wetRoad, wheel.onRoad, wheel.puddle) / rear.length
      }
      this.wake.place(0, x, ground + 0.02, -s, p.yaw, level, seconds, dt)
    }
  }
  manualInput(): Input {
    if (this.controlsBlocked) return { ...neutralInput }
    const has = (...codes: string[]) => codes.some((c) => this.keys.has(c))
    return mergeManualInput(
      {
        ...neutralInput,
        throttle: has('KeyW', 'ArrowUp') ? 1 : 0,
        boost: has('ShiftLeft', 'ShiftRight'),
        brake: has('KeyS', 'ArrowDown') ? 1 : 0,
        steer: (has('KeyA', 'ArrowLeft') ? 1 : 0) - (has('KeyD', 'ArrowRight') ? 1 : 0),
        steeringSource: has('KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight') ? 'digital' : null,
        handbrake: has('Space'),
      },
      this.touch,
      this.controllerInput,
      this.settings.mouseEnabled ? this.mouse.input() : null,
    )
  }
  pollController() {
    this.controllerInput = { ...neutralInput }
    this.controllerLook = { x: 0, y: 0, zoom: 0 }
    if (!this.settings.controllerEnabled) {
      this.controllerStatus = 'none'
      this.controller.suspend()
      return
    }
    try {
      if (!navigator.getGamepads) {
        this.controllerStatus = 'unavailable'
        return
      }
      const blocked = this.controlsBlocked || document.hidden || !document.hasFocus()
      if (blocked) this.controller.suspend()
      const frame = this.controller.read(
        navigator.getGamepads(),
        this.settings.controllerDeadzone,
        this.settings.controllerMode === 'custom' ? this.settings.controllerBindings : null,
      )
      this.controllerStatus = frame.status
      if (blocked) return
      this.controllerInput = frame.input
      if (!this.paused) this.controllerLook = frame.look
      if (!this.paused && !this.settings.mouseEnabled) {
        if (frame.steerActive) this.manualOverride('steer')
        if (frame.pedalsActive) this.manualOverride('speed')
        if (frame.handbrakeActive) this.manualOverride('all')
      }
      for (const action of frame.actions) {
        if (action === 'start') {
          if (!this.started) this.start()
          else if (this.paused) this.onAction?.('pause')
        } else if (action === 'reset') this.reset()
        else if (action === 'cameraCenter') this.view.center()
        else this.onAction?.(action)
      }
      if (!this.started && frame.pedalsActive && !this.settings.mouseEnabled) this.start()
    } catch {
      this.controllerStatus = 'unavailable'
    }
  }
  render = (time: number) => {
    if (this.disposed) return
    this.frame = requestAnimationFrame(this.render)
    const elapsed = this.lastTime ? (time - this.lastTime) / 1000 : 1 / 60
    const dt = Math.min(elapsed, 0.05)
    this.frameRate = Math.round(1 / Math.max(elapsed, 0.001))
    this.framePace += (elapsed - this.framePace) * 0.05
    this.frameJitter += (Math.abs(elapsed - this.framePace) - this.frameJitter) * 0.05
    const strained = frameStrained(elapsed, this.framePace, this.frameJitter)
    if (!this.software && this.started && !this.paused && !this.photo) {
      this.cinemaStrain = clamp(
        this.cinemaStrain + (strained ? elapsed : -elapsed),
        0,
        cinemaRelief.patience,
      )
      if (this.cinemaStrain >= cinemaRelief.patience) {
        this.cinemaStrain = 0
        const budget = graphicsBudget(this.renderer, this.settings.quality)
        if (this.renderScale < cinemaRelief.scales.length - 1) {
          this.renderScale++
          this.renderer.setPixelRatio(this.pixelRatio(budget))
        } else {
          this.cinemaBlocked = true
          this.configureCinema(budget)
        }
      }
    }
    this.lastTime = time
    this.pollController()
    let input = this.manualInput()
    if (
      !this.paused &&
      !this.photo &&
      !document.hidden &&
      (!this.controlsBlocked || !this.started || this.assistance === 'full')
    ) {
      this.simulation.advance(elapsed, (step) => {
        const automatic = this.physics.autoInput(
          this.started
            ? automaticTarget(this.assistance, this.settings.cruiseSpeed, this.settings.vehicle)
            : 10,
        )
        input = !this.started
          ? automatic
          : resolveInput(this.manualInput(), automatic, this.assistance, this.settings.onePedal)
        this.physics.update(step, input, this.settings)
        const lap = this.started ? this.laps.step(this.physics.s, step) : null
        if (lap) this.onLap?.(lap.time, lap.record)
      })
    }
    if (this.started && !this.paused && !this.photo && !document.hidden) this.advanceSky(dt)
    const p = this.physics
    this.water.update(p.x, p.s, time / 1000)
    positionVehicle(this.car, p, this.settings.vehicle, dt)
    this.trailTyres(dt, time / 1000)
    const footprint = footprints[this.settings.vehicle]
    const grounded = p.suspension.wheels.filter((wheel) => wheel.contact).length
    this.contact.position.copy(this.car.group.position)
    this.contact.quaternion.copy(this.car.group.quaternion)
    this.contact.translateY(contactShade.lift)
    this.contact.translateZ((footprint.rear - footprint.front) / 2)
    this.contact.scale.set(
      footprint.halfWidth * 2 * contactShade.margin,
      1,
      (footprint.front + footprint.rear) * contactShade.margin,
    )
    this.contact.material.opacity =
      (contactShade.opacity * grounded) / Math.max(1, p.suspension.wheels.length)
    const settling = this.arrival < vehicleArrival.duration
    this.arrival += dt
    if (settling) {
      const pose = arrivalPose(this.arrival)
      this.car.group.position.y += pose.lift
      this.car.group.scale.setScalar(pose.scale)
    }
    this.car.update(
      p.suspension.wheels,
      input.brake > 0 || input.regenBrake > 0,
      this.dark,
      p.speed,
    )
    const cameraMode = this.photo ? 'chase' : this.started ? this.settings.camera : 'cinematic'
    this.car.setExteriorVisible(cameraMode !== 'bonnet')
    this.car.body.envMapIntensity = cameraMode === 'bonnet' ? 0.3 : 0.55
    this.view.motion = this.settings.motion === 'calm' ? 0 : 1
    this.view.controllerLook(this.controllerLook, cameraMode, dt)
    this.view.update(p, this.world, cameraMode, dt)
    if (p.impact > 0.005 && this.view.motion) {
      const seconds = time / 1000
      this.camera.rotateX(Math.sin(seconds * 41 + 1.3) * p.impact * impactShake.pitch)
      this.camera.rotateZ(Math.sin(seconds * 53) * p.impact * impactShake.roll)
    }
    if (!this.paused && !this.photo) this.lifeClock += dt
    this.life?.update(
      this.settings,
      p,
      this.lifeClock,
      !this.dark,
      this.settings.weather !== 'storm',
    )
    this.travel.set(-Math.sin(p.yaw) * p.speed, 0, -Math.cos(p.yaw) * p.speed)
    this.precipitation.update(this.camera, this.canvas.height, time / 1000, this.travel)
    this.terrain.update(p.s, time / 1000, -this.camera.position.z, p.x)
    this.sky.position.copy(this.camera.position)
    if (this.sky.material.uniforms.time) this.sky.material.uniforms.time.value = time / 1000
    this.sun.position.set(p.x + sunOffset.x, p.y + this.sunHeight, -p.s + sunOffset.z)
    this.sun.target.position.set(p.x, p.y, -p.s - 15)
    this.audio.update(p, input, this.settings, this.paused || this.photo || !this.started, dt)
    if (this.started) this.minimap.update(p)
    if (this.started) this.atlas.update(p)
    this.drawScene()
    this.crossfade.rendered()
    if (!this.rendered) this.canvas.style.visibility = ''
    this.rendered = true
    if (!this.lastTelemetry || time - this.lastTelemetry > 100) {
      this.emitState()
      this.lastTelemetry = time
    }
  }
  drawScene() {
    if (this.cinema) {
      const air = this.cinema.air
      air.sunDirection.copy(this.sun.position).sub(this.sun.target.position).normalize()
      air.sunColor.copy(this.sun.color).multiplyScalar(this.sun.intensity * 0.22)
      if (this.scene.fog) air.hazeColor.copy(this.scene.fog.color)
      const pace = Math.abs(this.physics.speed) / vehicleMetrics[this.settings.vehicle].maxSpeed
      this.cinema.rush =
        this.started && this.view.motion
          ? clamp(this.view.rush * 0.85 + clamp((pace - 0.8) / 0.4, 0, 1) * 0.4, 0, 1)
          : 0
      this.cinema.lensRain =
        this.wetRoad && this.view.motion ? (this.settings.camera === 'bonnet' ? 1 : 0.8) : 0
      this.cinema.lensTime = this.dayClock
      this.cinema.render(this.scene, this.camera)
    } else this.renderer.render(this.scene, this.camera)
    this.antialiasing?.render(this.renderer)
  }
  screenshot() {
    const link = document.createElement('a')
    link.download = 'slow-voyage.png'
    link.href = this.canvas.toDataURL('image/png')
    link.click()
  }
  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    window.removeEventListener('resize', this.resize)
    window.removeEventListener('keydown', this.keyDown)
    window.removeEventListener('keyup', this.keyUp)
    window.removeEventListener('blur', this.blur)
    document.removeEventListener('visibilitychange', this.visibility)
    this.canvas.removeEventListener('pointermove', this.pointerMove)
    this.canvas.removeEventListener('pointerdown', this.pointerDown)
    this.canvas.removeEventListener('pointerup', this.pointerUp)
    this.canvas.removeEventListener('pointercancel', this.pointerCancel)
    this.canvas.removeEventListener('pointerleave', this.pointerLeave)
    this.canvas.removeEventListener('contextmenu', this.contextMenu)
    this.canvas.removeEventListener('wheel', this.cameraWheel)
    this.canvas.removeEventListener('dblclick', this.cameraCenter)
    this.canvas.removeEventListener('lostpointercapture', this.pointerCancel)
    this.terrain.dispose()
    this.water.dispose()
    this.precipitation.dispose()
    this.life?.dispose()
    this.cast?.dispose()
    this.atmosphere.dispose()
    this.car.dispose()
    this.tyreClouds.dispose()
    this.wake?.dispose()
    this.skids.dispose()
    this.contact.geometry.dispose()
    this.contact.material.map?.dispose()
    this.contact.material.dispose()
    for (const light of this.headlights) light.dispose()
    this.sky.geometry.dispose()
    this.sky.material.dispose()
    this.sun.shadow.dispose()
    this.audio.dispose()
    this.antialiasing?.dispose()
    this.cinema?.dispose()
    this.crossfade.dispose()
    this.renderer.dispose()
  }
}
