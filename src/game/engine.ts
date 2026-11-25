import * as THREE from 'three'
import { Atmosphere, atmosphereProfile, sunOffset } from './atmosphere'
import { DriveAudio } from './audio'
import { DrivingCamera } from './camera'
import { Cast } from './cast'
import { CinematicPipeline } from './cinema'
import { dressVehicle } from './coachwork'
import { footprints } from './collision'
import { contactPatch, contactShade } from './contact-shadow'
import {
  automaticTarget,
  mergeManualInput,
  neutralInput,
  releaseAssistance,
  resolveInput,
  SteeringHandover,
  steers,
} from './controls'
import { crossfadeTiming, SceneCrossfade } from './crossfade'
import { effectsLevel, RoadEffects } from './effects'
import { type ControllerLook, type ControllerStatus, GamepadControls } from './gamepad'
import { FrameGovernor, governorPlan, reliefLevels } from './governor'
import {
  cinemaRelief,
  cinemaStepFor,
  createGraphicsRenderer,
  displayCapped,
  frameStrained,
  GpuClock,
  graphicsBudget,
  renderWait,
  SoftwareGauge,
  StrainGauge,
  shadowReach,
  softwareRelief,
  textureDetail,
  ultraReach,
} from './graphics'
import { beamHaze, Lamps } from './lamps'
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
import { bulky, carFrame, heft, reactionLayout } from './reactions'
import { puddleLevel } from './road-condition'
import { fitShadowsToSurfaces } from './shadow-filter'
import { SimulationClock } from './simulation-clock'
import { ScenicSky } from './sky'
import { skyline } from './skyline'
import { SoftwareAntialias } from './software-antialias'
import { Terrain } from './terrain'
import { SkidMarks, trailLayout } from './tyre-trail'
import type { UltraPipeline } from './ultra'
import { vehicleMetrics } from './vehicles'
import { Wake, wakeStrength } from './wake'
import { Water } from './water'
import {
  type AssistanceMode,
  angleDifference,
  clamp,
  defaults,
  type Settings,
  World,
} from './world'
import { WorldMap } from './world-map'

const paintBudget = 11
const paintDepth = 0.7
const retireDelay = 90

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
  const geometry = new THREE.PlaneGeometry(1, 1, contactShade.columns, contactShade.rows)
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
  mesh.frustumCulled = false
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
  ultra: UltraPipeline | null = null
  ultraKit: typeof import('./ultra') | null = null
  ultraPending: Promise<void> | null = null
  governor = new FrameGovernor()
  gpuClock: GpuClock | null = null
  strainGauge = new StrainGauge()
  softwareGauge = new SoftwareGauge()
  handover = new SteeringHandover()
  redraw = false
  framePace = 1 / 60
  frameJitter = 0
  dayClock = 0
  lifeClock = 0
  life: Life | null = null
  cast: Cast | null = null
  contact = contactShadow()
  effects: RoadEffects | null = null
  lamps: Lamps
  lampLevel = 0
  beamHaze = 0
  skids = new SkidMarks()
  wake: Wake | null = null
  wetRoad = false
  private neutralFill = new THREE.Color('#efe9e1')
  private travel = new THREE.Vector3()
  private skyTone = new THREE.Color()
  private lampFront = new THREE.Vector3()
  private lampBack = new THREE.Vector3()
  laps = new LapClock()
  photo = false
  onLap?: (time: number, record: boolean) => void
  onProgress?: (fraction: number, stage: 'stone' | 'hills' | 'light') => void
  software = false
  renderScale = 0
  carriedScale = 0
  retired: UltraPipeline | null = null
  retiredFrames = 0
  onDiscover?: (kind: LandmarkKind, found: number, total: number) => void
  onQuality?: (quality: Settings['quality']) => void
  lightingAt = 0
  reflectionAt = Number.NEGATIVE_INFINITY
  dark = false
  lightning = { next: 6, flash: 0, base: 0 }
  cinemaBlocked = false
  budgetReadout = {
    quality: 'high',
    target: governorPlan.frame * 1000,
    median: 0,
    tail: 0,
    scale: 1,
    relief: 0,
    gpu: 0,
  }
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
  incoming: VehicleModel | null = null
  audio = new DriveAudio()
  atmosphere: Atmosphere
  precipitation: Precipitation
  sun = new THREE.DirectionalLight('#fff3d5', 2.5)
  ambient = new THREE.HemisphereLight('#dae9ec', '#9ba47c', 1.9)
  headlights: THREE.SpotLight[] = []
  spill = new THREE.SpotLight('#ffe6c2', 0, 60, 0.4, 1, 0)
  tailGlow = new THREE.PointLight('#ff2812', 0, 7, 1.7)
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
  held = { x: 0, y: 0, s: 0, yaw: 0, pitch: 0, roll: 0 }
  shown: CarPhysics | null = null
  driver = { x: 0, s: 0, yaw: 0, speed: 0, halfWidth: 1, front: 2, rear: 2 }
  lifeAlarm = -10
  shiftQueue = 0
  lastPace = 0
  sunReach = new THREE.Vector3()
  sunToward = new THREE.Vector3()
  sunAcross = new THREE.Vector3()
  sunUpward = new THREE.Vector3()
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
    this.redraw = true
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
    if (event.code === 'KeyQ' && !this.shiftBy(-1)) this.onAction?.('journeyPrevious')
    if (event.code === 'KeyE' && !this.shiftBy(1)) this.onAction?.('journeyNext')
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
    fitShadowsToSurfaces()
    this.renderer = createGraphicsRenderer(canvas)
    const budget = graphicsBudget(this.renderer, this.settings.quality)
    textureDetail.anisotropy = budget.anisotropy
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
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -shadowReach.span / 2
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = shadowReach.span / 2
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
      const canopy = this.terrain
      this.life.shadeAt = (x, s) => canopy.shadeAt(x, s)
      this.scene.add(this.life.group, this.cast.group)
    }
    const terrain = this.terrain
    const life = this.life
    this.physics.trunks = function* (s) {
      yield* terrain.trunksNear(s)
      if (life) yield* life.obstacles(s)
    }
    this.atmosphere = new Atmosphere(this.renderer, budget.software)
    this.precipitation = new Precipitation(this.scene)
    this.car = createVehicleModel(this.settings, budget.software)
    const noise = this.terrain.grassMaterial.fieldUniforms.fieldNoiseMap
    this.lamps = new Lamps()
    if (!budget.software)
      dressVehicle(this.car, this.settings.vehicle, () => {
        this.configureHeadlights()
        this.applyLighting()
      })
    this.car.body.color.set(this.settings.color).multiplyScalar(paintDepth)
    this.scene.add(this.car.group, this.contact)
    this.canvas.dataset.vehicleShown = this.settings.vehicle
    if (!budget.software) {
      this.wake = new Wake(noise)
      this.effects = new RoadEffects(noise)
      this.scene.add(this.effects.particles.mesh, this.skids.mesh, this.wake.group)
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
    await this.ultraPending
    await this.terrain.grassMaterial.rock.ready
    await this.terrain.boulders?.ready
    await this.terrain.foliage.ready
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
    const pipeline = this.ultra ?? this.cinema
    if (pipeline) {
      pipeline.resize()
      this.renderer.setRenderTarget(pipeline.scene)
    }
    this.onProgress?.(0.9, 'light')
    await this.renderer.compileAsync(this.scene, this.camera)
    this.renderer.setRenderTarget(null)
    if (this.disposed) return
    this.onProgress?.(1, 'light')
    this.drawScene()
    this.renderer.getContext().finish()
    if (this.ultra) {
      this.cinema?.warm()
      if (this.probe() > ultraReach.probe) this.easeQuality()
    }
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
    this.governor.hold()
    this.audio.start(this.settings.volume)
    this.physics.distance = 0
    if (assistance === 'off' || assistance === 'steer') this.physics.speed = 0
    this.emitState()
  }
  setAssistance(mode: AssistanceMode) {
    if (!this.started && mode !== 'off') this.start(mode)
    else {
      if (steers(this.assistance) && !steers(mode)) this.handover.begin()
      else if (steers(mode)) this.handover.cancel()
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
    if (this.paused && !paused) this.strainGauge.hold()
    this.paused = paused
    this.blur()
    this.emitState()
  }
  setControlsBlocked(blocked: boolean) {
    this.redraw = true
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
    this.handover.cancel()
    this.mouse.reset()
    this.physics.reset()
    this.view.center()
    this.view.snap()
  }
  setSettings(settings: Settings) {
    const budget = graphicsBudget(this.renderer, settings.quality)
    const roadChange =
      settings.landscape !== this.settings.landscape ||
      settings.seed !== this.settings.seed ||
      settings.roadMode !== this.settings.roadMode
    const refresh =
      roadChange ||
      settings.season !== this.settings.season ||
      settings.landscape !== this.settings.landscape ||
      budget.detail !== this.terrain.quality ||
      settings.seed !== this.settings.seed
    const vehicleChange = settings.vehicle !== this.settings.vehicle
    const assistanceChange = settings.autodriveMode !== this.settings.autodriveMode
    const mouseChange = settings.mouseEnabled !== this.settings.mouseEnabled
    const cameraChange = settings.camera !== this.settings.camera
    const environmentChange =
      refresh ||
      settings.daylight !== this.settings.daylight ||
      settings.weather !== this.settings.weather
    this.redraw = true
    if (environmentChange && this.rendered) this.crossfade.capture()
    this.strainGauge.hold()
    this.governor.hold()
    if (settings.quality !== this.settings.quality) {
      this.renderScale = this.carriedScale
      this.carriedScale = 0
      this.cinemaBlocked = false
      this.governor.reset()
    }
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
      this.incoming?.dispose()
      const next = createVehicleModel(this.settings, budget.software)
      this.incoming = next
      const ready = () => {
        if (this.disposed || this.incoming !== next) return
        this.incoming = null
        this.mountVehicle(next)
      }
      const dressing = !budget.software && dressVehicle(next, this.settings.vehicle, ready)
      if (!dressing) ready()
      this.physics.suspension.configure(settings.vehicle)
      this.physics.suspension.reset(this.physics)
    }
    this.car.body.color.set(settings.color).multiplyScalar(paintDepth)
    this.incoming?.body.color.set(settings.color).multiplyScalar(paintDepth)
    this.configureCinema(budget)
    this.applyRenderScale(budget)
    this.configureShadows(budget)
    this.applyLighting()
    if (assistanceChange && this.assistance !== 'off') this.setAssistance(settings.autodriveMode)
  }
  pixelRatio(budget: ReturnType<typeof graphicsBudget>) {
    if (budget.software) return budget.pixelRatio * (softwareRelief.scales[this.renderScale] ?? 1)
    if (budget.cinematic) return budget.pixelRatio
    return budget.pixelRatio * (cinemaRelief.scales[this.renderScale] ?? 1)
  }
  applyRenderScale(budget: ReturnType<typeof graphicsBudget>) {
    const ratio = this.pixelRatio(budget)
    if (this.renderer.getPixelRatio() !== ratio) this.renderer.setPixelRatio(ratio)
    if (this.cinema) this.cinema.scale = cinemaRelief.scales[this.renderScale] ?? 1
  }
  configureCinema(budget: ReturnType<typeof graphicsBudget>) {
    if (budget.ultra && !this.ultra && this.ultraKit) {
      this.ultra = new this.ultraKit.UltraPipeline(this.renderer, this.scene, this.camera)
      this.gpuClock ??= new GpuClock(this.renderer.getContext() as WebGL2RenderingContext)
    }
    if (budget.ultra && !this.ultraKit)
      this.ultraPending ??= import('./ultra')
        .then((kit) => {
          this.ultraKit = kit
          if (!this.disposed)
            this.configureCinema(graphicsBudget(this.renderer, this.settings.quality))
        })
        .catch(() => {})
        .finally(() => {
          this.ultraPending = null
        })
    if (!budget.ultra && this.ultra) {
      this.retired?.dispose()
      this.retired = this.ultra
      this.retiredFrames = retireDelay
      this.ultra = null
    }
    this.ultra?.tune(this.governor.scale, this.governor.relief)
    if (this.ultra) this.cinema?.rest()
    const cinematic = budget.cinematic
    if (cinematic && !this.cinema) this.cinema = new CinematicPipeline(this.renderer)
    if (this.cinema) this.cinema.bare = this.cinemaBlocked
    if (!cinematic && this.cinema) {
      this.cinema.dispose()
      this.cinema = null
    }
    const level = effectsLevel(budget.software, this.settings.quality, budget.ultra)
    this.effects?.setLevel(level)
    this.lamps.setLevel(level)
    const solid = this.sky.material.uniforms.solid
    if (solid) solid.value = this.cinema || this.ultra ? 0 : 1
  }
  probe() {
    const context = this.renderer.getContext()
    let quickest = Number.POSITIVE_INFINITY
    for (let frame = 0; frame < 3; frame++) {
      const before = performance.now()
      this.drawScene()
      context.finish()
      quickest = Math.min(quickest, performance.now() - before)
    }
    return quickest / 1000
  }
  easeQuality(governed = false) {
    if (governed) this.carriedScale = cinemaStepFor(this.governor.scale)
    else if (this.rendered) this.crossfade.capture(crossfadeTiming.reducedDuration * 2)
    this.setSettings({ ...this.settings, quality: 'high' })
    this.onQuality?.('high')
  }
  frameBudget() {
    const { governor } = this
    this.budgetReadout.quality = this.ultra ? 'ultra' : this.cinema ? 'high' : 'low'
    this.budgetReadout.median = governor.median * 1000
    this.budgetReadout.tail = governor.tail * 1000
    this.budgetReadout.scale = this.ultra
      ? governor.scale
      : (cinemaRelief.scales[this.renderScale] ?? 1)
    this.budgetReadout.relief = governor.relief
    this.budgetReadout.gpu = governor.load * 1000
    return this.budgetReadout
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
  mountVehicle(next: VehicleModel) {
    this.canvas.dataset.vehicleShown = this.settings.vehicle
    if (this.rendered) this.crossfade.capture(vehicleArrival.fade)
    this.strainGauge.hold()
    this.scene.remove(this.car.group)
    this.car.dispose()
    this.car = next
    this.scene.add(next.group)
    this.configureHeadlights()
    this.reflect(next.group, this.scene.environment)
    this.arrival = 0
  }
  reflect(group: THREE.Object3D, environment: THREE.Texture | null) {
    const level = this.atmosphere.level
    group.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        !(object.material instanceof THREE.MeshPhysicalMaterial)
      )
        return
      const material = object.material
      material.envMap = environment
      const base: number = material.userData.envBase ?? material.envMapIntensity
      material.userData.envBase = base
      material.envMapIntensity = base * level
    })
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
    const nose = this.car.headlightPositions[0] ?? [0, 0.6, -2]
    const reach = footprints[this.settings.vehicle]
    this.spill.position.set(0, 1.5, nose[2] + 1)
    this.spill.target.position.set(0, -1.2, nose[2] - 24)
    this.tailGlow.position.set(0, 0.14, reach.rear - 0.15)
    this.car.group.add(this.spill, this.spill.target, this.tailGlow)
    const heads = this.car.headlightPositions
    const tails =
      this.car.tailLightPositions ??
      heads.map(([x, y]) => [x * 0.92, y + 0.06, reach.rear - 0.06] as [number, number, number])
    this.lamps.fit(heads, tails)
    this.lampFront.set(0, nose[1], nose[2] - 0.3)
    this.lampBack.set(0, tails[0]?.[1] ?? 0.8, (tails[0]?.[2] ?? reach.rear) + 0.3)
    this.car.group.add(this.lamps.group)
  }
  applyLighting(drifting = false) {
    const profile = atmosphereProfile(this.settings, this.dayClock)
    this.water.setAppearance(this.settings.season === 'winter', profile)
    this.sunHeight = profile.sunHeight
    if (!drifting || this.dayClock - this.reflectionAt >= lightingPace.reflection) {
      this.reflectionAt = this.dayClock
      const environment = this.atmosphere.setAppearance(this.settings, profile)
      this.scene.environment = environment
      this.scene.environmentIntensity = 0.13 * this.atmosphere.level
      this.reflect(this.car.group, environment)
      this.terrain.roadMaterial.envMap = environment
    }
    this.precipitation.setAppearance(this.settings, profile)
    const night = profile.night > 0.5
    this.dark = night
    this.wetRoad = profile.wet
    this.wake?.setLight(
      clamp((profile.sunlight / 2.5) * 0.55 + (profile.ambient / 2.6) * 0.45, 0.08, 1) ** 1.4,
    )
    if (this.effects) {
      this.effects.setScene(this.settings, profile.wet)
      const light = this.effects.particles.light
      light.sunDirection.value.set(sunOffset.x, profile.sunHeight, sunOffset.z).normalize()
      light.sunColor.value.set(profile.sun).multiplyScalar(profile.sunlight / Math.PI)
      light.skyColor.value
        .set(profile.horizon)
        .lerp(this.neutralFill, 0.6)
        .multiplyScalar((profile.ambient * (profile.night ? 0.95 : 0.34)) / Math.PI + 0.02)
      light.groundColor.value.copy(light.skyColor.value).multiplyScalar(0.55)
    }
    this.beamHaze = beamHaze(profile.fog, profile.wet || profile.snow, night)
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
    this.ambient.intensity = profile.ambient * (profile.night ? 0.95 : 0.34)
    this.ambient.color.set(profile.horizon).lerp(this.neutralFill, 0.8)
    this.terrain.boulders?.tint(landscapeProfiles[this.settings.landscape].field?.rock ?? '#8c877a')
    this.terrain.boulders?.dress(this.settings.season)
    const glow = Math.max(
      profile.night ? 0.38 : 0.2,
      clamp(profile.ambient / 2.6, 0.06, 1) * (profile.night ? 0.5 : 1),
    )
    skyline.horizon.value.set(profile.horizon).multiplyScalar(glow * 0.9)
    skyline.zenith.value.set(profile.sky).multiplyScalar(glow * 0.8)
    skyline.ground.value.set('#3b4034').multiplyScalar(glow)
    skyline.cloud.value.set(profile.cloudColor).multiplyScalar(glow)
    skyline.clouds.value = profile.clouds
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
    this.terrain.roadMaterial.color.set(profile.wet ? '#a9b1b6' : '#cbc9c4')
    this.terrain.roadMaterial.envMapIntensity = (profile.wet ? 0.8 : 0.2) * this.atmosphere.level
    this.lampLevel =
      night || profile.wet || profile.snow || this.settings.weather === 'fog'
        ? night
          ? 1
          : clamp(1 - profile.sunlight * 0.6 - profile.ambient * 0.25, 0.08, 1)
        : 0
    for (const [index, light] of this.headlights.entries())
      light.intensity = index < this.car.headlightPositions.length ? 150 * this.lampLevel : 0
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
    }
    this.effects?.update(p, this.world, active, seconds, dt)
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
  stickDriven() {
    return (
      this.started &&
      this.settings.transmission === 'manual' &&
      this.assistance !== 'full' &&
      this.assistance !== 'speed'
    )
  }
  shiftBy(direction: number) {
    if (!this.stickDriven() || this.paused || this.photo) return false
    this.shiftQueue = clamp(this.shiftQueue + direction, -3, 3)
    return true
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
        else if (action === 'journeyNext' && this.shiftBy(1)) continue
        else if (action === 'journeyPrevious' && this.shiftBy(-1)) continue
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
    const settled = this.arrival >= vehicleArrival.duration && this.incoming === null
    const wait = renderWait(this.paused, this.software && this.controlsBlocked && settled)
    this.terrain.unhurried = wait > 0 && !this.paused
    if (wait > 0 && !this.photo && !this.redraw && this.rendered && time - this.lastTime < wait)
      return
    this.redraw = false
    const elapsed = this.lastTime ? (time - this.lastTime) / 1000 : 1 / 60
    const dt = Math.min(elapsed, 0.05)
    this.frameRate = Math.round(1 / Math.max(elapsed, 0.001))
    this.framePace += (elapsed - this.framePace) * 0.05
    this.frameJitter += (Math.abs(elapsed - this.framePace) - this.frameJitter) * 0.05
    const strained = frameStrained(elapsed, this.framePace, this.frameJitter)
    const driving = this.started && !this.paused && !this.photo
    const busy = this.terrain.rebuilding || this.crossfade.active || this.incoming !== null
    const governed = this.governor.step(
      elapsed,
      busy || !driving,
      displayCapped(this.framePace, this.frameJitter),
      this.ultra !== null,
      this.gpuClock?.read(),
    )
    if (governed === 'adjust') {
      this.ultra?.tune(this.governor.scale, this.governor.relief)
      if (this.governor.relief === reliefLevels.plain && this.cinema) {
        this.cinema.scale = cinemaRelief.scales[cinemaStepFor(this.governor.scale)] ?? 1
        this.cinema.resize()
      } else if (this.ultra) this.cinema?.rest()
    }
    if (governed === 'fallback') this.easeQuality(true)
    if (this.retired && --this.retiredFrames <= 0) {
      this.retired.dispose()
      this.retired = null
    }
    if (!this.software && !this.ultra && driving) {
      const verdict = this.strainGauge.step(elapsed, strained, busy, this.renderScale)
      if (verdict) {
        const budget = graphicsBudget(this.renderer, this.settings.quality)
        if (verdict === 'raise') {
          this.renderScale--
        } else if (this.renderScale < cinemaRelief.scales.length - 1) {
          this.renderScale++
        } else {
          this.cinemaBlocked = true
          this.configureCinema(budget)
        }
        this.applyRenderScale(budget)
      }
    }
    if (this.software && this.started && !this.paused && !this.photo) {
      const verdict = this.softwareGauge.step(
        elapsed,
        this.controlsBlocked ||
          this.terrain.rebuilding ||
          this.crossfade.active ||
          this.incoming !== null,
        this.renderScale,
      )
      if (verdict) {
        this.renderScale += verdict === 'raise' ? -1 : 1
        this.renderer.setPixelRatio(
          this.pixelRatio(graphicsBudget(this.renderer, this.settings.quality)),
        )
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
        const body = this.physics
        const held = this.held
        held.x = body.x
        held.y = body.y
        held.s = body.s
        held.yaw = body.yaw
        held.pitch = body.pitch
        held.roll = body.roll
        const automatic = this.physics.autoInput(
          this.started
            ? automaticTarget(this.assistance, this.settings.cruiseSpeed, this.settings.vehicle)
            : 10,
        )
        const manual = this.manualInput()
        input = !this.started
          ? automatic
          : resolveInput(
              steers(this.assistance)
                ? manual
                : this.handover.blend(manual, automatic, this.physics.speed, step),
              automatic,
              this.assistance,
              this.settings.onePedal,
            )
        if (this.stickDriven()) {
          input = { ...input, manual: true, shift: Math.sign(this.shiftQueue) }
          this.shiftQueue -= Math.sign(this.shiftQueue)
        } else this.shiftQueue = 0
        this.physics.update(step, input, this.settings)
        const lap = this.started ? this.laps.step(this.physics.s, step) : null
        if (lap) this.onLap?.(lap.time, lap.record)
      })
    }
    if (this.started && !this.paused && !this.photo && !document.hidden) this.advanceSky(dt)
    const p = this.present()
    this.water.update(p.x, p.s, time / 1000)
    positionVehicle(this.car, p, this.settings.vehicle, dt)
    this.trailTyres(dt, time / 1000)
    const footprint = footprints[this.settings.vehicle]
    const grounded = p.suspension.wheels.filter((wheel) => wheel.contact).length
    const outline = this.contact.geometry.getAttribute('position')
    const patch = contactPatch(this.world, p, footprint, outline.array as Float32Array)
    outline.needsUpdate = true
    this.contact.material.opacity =
      (contactShade.opacity * patch.strength * grounded) / Math.max(1, p.suspension.wheels.length)
    const settling = this.arrival < vehicleArrival.duration
    this.arrival += Math.min(elapsed, 0.25)
    if (settling) {
      const pose = arrivalPose(this.arrival)
      this.car.group.position.y += pose.lift
      this.car.group.scale.setScalar(pose.scale)
    }
    const braking = input.brake > 0 || input.regenBrake > 0
    const lamps = this.lampLevel
    this.car.update(p.suspension.wheels, braking, lamps > 0.05, p.speed)
    const beams = (this.headlights[0]?.intensity ?? 0) / 210
    this.spill.intensity = beams * 2.4
    this.tailGlow.intensity = beams * (braking ? 4 : 1.1)
    const tail = braking ? 0.5 + lamps * 0.5 : lamps * 0.4
    this.lamps.update(
      lamps,
      tail,
      this.beamHaze,
      p.y,
      this.canvas.height,
      this.settings.camera !== 'bonnet' || this.photo,
    )
    if (this.effects) {
      const light = this.effects.particles.light
      const group = this.car.group
      light.lampOrigin.value.copy(this.lampFront).applyMatrix4(group.matrixWorld)
      light.lampAim.value.set(0, -0.05, -1).transformDirection(group.matrixWorld)
      light.lampLevel.value = lamps * 3
      light.tailOrigin.value.copy(this.lampBack).applyMatrix4(group.matrixWorld)
      light.tailLevel.value = tail * 1.6
    }
    const cameraMode = this.photo ? 'chase' : this.started ? this.settings.camera : 'cinematic'
    this.car.setExteriorVisible(cameraMode !== 'bonnet')
    this.car.body.envMapIntensity = (cameraMode === 'bonnet' ? 0.3 : 0.16) * this.atmosphere.level
    skyline.strength.value = cameraMode === 'bonnet' ? 0.3 : 0.7
    this.view.motion = this.settings.motion === 'calm' ? 0 : 1
    this.view.controllerLook(this.controllerLook, cameraMode, dt)
    this.view.impact = p.impact
    this.view.frozen = this.paused || this.photo
    this.view.update(p, this.world, cameraMode, dt)
    if (!this.paused && !this.photo) this.lifeClock += dt
    if (this.life) {
      const driver = this.driver
      driver.x = p.x
      driver.s = p.s
      driver.yaw = p.yaw
      driver.speed = Math.abs(this.lastPace) > Math.abs(p.speed) ? this.lastPace : p.speed
      this.lastPace = p.speed
      driver.halfWidth = footprint.halfWidth
      driver.front = footprint.front
      driver.rear = footprint.rear
      this.life.update(
        this.settings,
        driver,
        this.lifeClock,
        !this.dark,
        this.settings.weather !== 'storm',
        this.audio.hornHeld && this.started && !this.paused,
      )
      for (const knock of this.life.knocks) {
        const weight = heft[knock.kind]
        if (!bulky(knock.kind)) this.physics.speed *= 1 - weight * 0.6
        else {
          const kept = Math.abs(driver.speed) * Math.max(0.2, 1 - weight * reactionLayout.carry)
          if (Math.abs(this.physics.speed) < kept)
            this.physics.speed = kept * (Math.sign(driver.speed) || 1)
        }
        this.physics.impact = Math.max(this.physics.impact, Math.min(1, 0.3 + weight * 1.6))
        this.audio.thud(knock.distance, Math.min(1, weight * 3))
        if (knock.kind === 'person')
          this.audio.cry(
            knock.voice,
            true,
            knock.distance,
            0,
            carFrame(driver, knock.x, knock.s),
            driver.speed,
          )
        this.lifeAlarm = this.lifeClock
      }
      for (const kind of this.terrain.brush(driver)) {
        this.physics.speed *= kind === 'post' ? 0.985 : 0.95
        this.physics.impact = Math.max(this.physics.impact, kind === 'post' ? 0.25 : 0.18)
        this.audio.brushed(kind === 'post')
      }
      const panicked = this.lifeClock - this.lifeAlarm < 0.6
      for (const [index, startled] of this.life.startled.slice(0, 4).entries())
        this.audio.cry(
          startled.voice,
          panicked,
          startled.distance,
          0.12 + index * (0.14 + Math.random() * 0.2),
          carFrame(driver, startled.x, startled.s),
          driver.speed,
        )
    }
    this.travel.set(-Math.sin(p.yaw) * p.speed, 0, -Math.cos(p.yaw) * p.speed)
    this.precipitation.update(this.camera, this.canvas.height, time / 1000, this.travel)
    this.terrain.update(p.s, time / 1000, -this.camera.position.z, p.x)
    this.sky.position.copy(this.camera.position)
    if (this.sky.material.uniforms.time) this.sky.material.uniforms.time.value = time / 1000
    this.aimSun(p.x, p.y, -p.s - 15)
    this.audio.update(
      p,
      input,
      this.settings,
      this.paused || this.photo || !this.started,
      dt,
      this.dayClock,
    )
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
  aimSun(x: number, y: number, z: number) {
    const reach = this.sunReach.set(sunOffset.x, this.sunHeight, sunOffset.z + 15)
    const toward = this.sunToward.copy(reach).normalize()
    const across = this.sunAcross.set(toward.z, 0, -toward.x).normalize()
    const upward = this.sunUpward.crossVectors(toward, across)
    const shadow = this.sun.shadow
    const texel = (shadow.camera.right - shadow.camera.left) / shadow.mapSize.x
    const centre = this.sun.target.position.set(x, y, z)
    const along = centre.dot(toward)
    const sideways = Math.round(centre.dot(across) / texel) * texel
    const raised = Math.round(centre.dot(upward) / texel) * texel
    centre
      .copy(toward)
      .multiplyScalar(along)
      .addScaledVector(across, sideways)
      .addScaledVector(upward, raised)
    this.sun.position.copy(centre).add(reach)
  }
  present() {
    const body = this.physics
    const held = this.held
    this.shown ??= Object.create(body) as CarPhysics
    const shown = this.shown
    if (Object.getPrototypeOf(shown) !== body) Object.setPrototypeOf(shown, body)
    const jumped = Math.abs(body.s - held.s) > 4 || Math.abs(body.x - held.x) > 4
    const blend = jumped ? 1 : clamp(this.simulation.accumulator / this.simulation.step, 0, 1)
    shown.x = held.x + (body.x - held.x) * blend
    shown.y = held.y + (body.y - held.y) * blend
    shown.s = held.s + (body.s - held.s) * blend
    shown.yaw = held.yaw + angleDifference(body.yaw, held.yaw) * blend
    shown.pitch = held.pitch + (body.pitch - held.pitch) * blend
    shown.roll = held.roll + (body.roll - held.roll) * blend
    return shown
  }
  drawScene() {
    const pipeline = this.ultra ?? this.cinema
    if (pipeline) {
      const air = pipeline.air
      air.sunDirection.copy(this.sun.position).sub(this.sun.target.position).normalize()
      air.sunColor.copy(this.sun.color).multiplyScalar(this.sun.intensity * 0.22)
      if (this.scene.fog) air.hazeColor.copy(this.scene.fog.color)
      const pace = Math.abs(this.physics.speed) / vehicleMetrics[this.settings.vehicle].maxSpeed
      pipeline.rush =
        this.started && this.view.motion
          ? clamp(this.view.rush * 0.85 + clamp((pace - 0.8) / 0.4, 0, 1) * 0.4, 0, 1)
          : 0
      pipeline.lensRain =
        this.wetRoad && this.view.motion ? (this.settings.camera === 'bonnet' ? 1 : 0.35) : 0
      pipeline.lensTime = this.dayClock
      if (this.ultra) this.gpuClock?.begin()
      pipeline.render(this.scene, this.camera)
      this.gpuClock?.end()
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
    this.incoming?.dispose()
    this.effects?.dispose()
    this.lamps.dispose()
    this.wake?.dispose()
    this.skids.dispose()
    this.contact.geometry.dispose()
    this.contact.material.map?.dispose()
    this.contact.material.dispose()
    for (const light of this.headlights) light.dispose()
    this.spill.dispose()
    this.tailGlow.dispose()
    this.sky.geometry.dispose()
    this.sky.material.dispose()
    this.sun.shadow.dispose()
    this.audio.dispose()
    this.antialiasing?.dispose()
    this.cinema?.dispose()
    this.ultra?.dispose()
    this.retired?.dispose()
    this.gpuClock?.dispose()
    this.crossfade.dispose()
    this.renderer.dispose()
  }
}
