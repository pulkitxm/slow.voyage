import * as THREE from 'three'
import { Atmosphere, atmosphereProfile, sunOffset } from './atmosphere'
import { DriveAudio } from './audio'
import { DrivingCamera } from './camera'
import {
  automaticTarget,
  mergeManualInput,
  neutralInput,
  releaseAssistance,
  resolveInput,
} from './controls'
import { SceneCrossfade } from './crossfade'
import { type ControllerLook, type ControllerStatus, GamepadControls } from './gamepad'
import { createGraphicsRenderer, graphicsBudget } from './graphics'
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
import { SimulationClock } from './simulation-clock'
import { ScenicSky } from './sky'
import { SoftwareAntialias } from './software-antialias'
import { Terrain } from './terrain'
import { Water } from './water'
import { type AssistanceMode, defaults, type Settings, World } from './world'

const impactShake = { pitch: 0.025, roll: 0.035 }

export interface DriveState extends Telemetry {
  assistance: AssistanceMode
  paused: boolean
  fps: number
  controller: ControllerStatus
  mouseSteering: number
}
export class RoadEngine {
  renderer: THREE.WebGLRenderer
  antialiasing: SoftwareAntialias | null
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(68, 1, 0.1, 3600)
  settings: Settings
  world: World
  physics: CarPhysics
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
      | 'journeyNext'
      | 'journeyPrevious'
      | 'vehicleNext'
      | 'vehiclePrevious',
  ) => void
  resize = () => {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
  }
  keyDown = (event: KeyboardEvent) => {
    if (!this.rendered) return
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
    if (event.code === 'KeyM') this.onAction?.('mouse')
    if (event.code === 'KeyQ') this.onAction?.('journeyPrevious')
    if (event.code === 'KeyE') this.onAction?.('journeyNext')
    if (event.code === 'KeyV') this.onAction?.(event.shiftKey ? 'vehiclePrevious' : 'vehicleNext')
    if (['Equal', 'NumpadAdd'].includes(event.code)) this.onAction?.('cruiseUp')
    if (['Minus', 'NumpadSubtract'].includes(event.code)) this.onAction?.('cruiseDown')
    if (event.code === 'KeyP' || event.code === 'Escape') this.onAction?.('pause')
    if (event.code === 'KeyC') this.onAction?.('camera')
    if (event.code === 'KeyH') this.onAction?.('help')
    if (event.code === 'KeyR') this.reset()
  }
  keyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code)
  }
  blur = () => {
    this.keys.clear()
    this.touch = { ...neutralInput }
    this.controllerInput = { ...neutralInput }
    this.controllerLook = { x: 0, y: 0, zoom: 0 }
    this.physics.boosting = false
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
    this.crossfade = new SceneCrossfade(canvas)
    this.renderer = createGraphicsRenderer(canvas)
    const budget = graphicsBudget(this.renderer, this.settings.quality)
    this.antialiasing = budget.software ? new SoftwareAntialias() : null
    this.renderer.setPixelRatio(budget.pixelRatio)
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
    this.terrain = new Terrain(
      this.scene,
      this.world,
      budget.detail,
      budget.software,
      this.renderer.getContext().getContextAttributes()?.antialias ?? false,
    )
    this.physics.trunks = (s) => this.terrain.trunksNear(s)
    this.atmosphere = new Atmosphere(this.renderer)
    this.precipitation = new Precipitation(this.scene)
    this.car = createVehicleModel(this.settings, budget.software)
    this.scene.add(this.car.group)
    this.configureHeadlights()
    this.applyLighting()
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
    await this.terrain.grassMaterial.rock.ready
    if (this.disposed) return
    const p = this.physics
    this.terrain.update(p.s, 0, p.s, p.x)
    this.car.group.position.set(p.x, p.y, -p.s)
    this.camera.position.set(p.x, p.y + 5, -p.s + 12)
    this.camera.lookAt(p.x, p.y + 1, -p.s)
    this.sky.position.copy(this.camera.position)
    this.water.update(p.x, p.s, 0)
    this.precipitation.update(p.x, p.y, p.s, 0)
    this.sun.position.set(p.x + sunOffset.x, p.y + this.sunHeight, -p.s + sunOffset.z)
    this.sun.target.position.set(p.x, p.y, -p.s - 15)
    this.precipitation.rain.visible = this.precipitation.snow.visible = true
    await this.renderer.compileAsync(this.scene, this.camera)
    if (this.disposed) return
    this.drawScene()
    this.renderer.getContext().finish()
    this.precipitation.setAppearance(this.settings)
    if (!this.disposed) this.frame = requestAnimationFrame(this.render)
  }
  start(assistance: AssistanceMode = 'off') {
    this.started = true
    this.assistance = assistance
    this.paused = false
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
    this.onState?.({
      ...this.physics.telemetry(),
      assistance: this.assistance,
      paused: this.paused,
      fps: this.frameRate,
      controller: this.controllerStatus,
      mouseSteering: this.mouse.steer,
    })
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
    this.settings = { ...settings }
    this.world.settings = this.settings
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
    this.car.body.color.set(settings.color)
    this.renderer.setPixelRatio(budget.pixelRatio)
    this.configureShadows(budget)
    this.applyLighting()
    if (assistanceChange && this.assistance !== 'off') this.setAssistance(settings.autodriveMode)
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
        () => new THREE.SpotLight('#fff0cf', 40, 100, 0.42, 0.6, 1),
      )
    for (const [index, light] of this.headlights.entries()) {
      const position = this.car.headlightPositions[index] ??
        this.car.headlightPositions[0] ?? [0, 0, 0]
      light.position.set(...position)
      light.target.position.set(position[0] * 2, -0.5, position[2] - 45)
      this.car.group.add(light, light.target)
    }
  }
  applyLighting() {
    const profile = atmosphereProfile(this.settings)
    this.water.setAppearance(this.settings.daylight, this.settings.season === 'winter', profile)
    this.sunHeight = profile.sunHeight
    const environment = this.atmosphere.setAppearance(this.settings)
    this.scene.environment = environment
    this.scene.environmentIntensity = 0.35
    this.car.group.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshPhysicalMaterial) {
        object.material.envMap = environment
      }
    })
    this.precipitation.setAppearance(this.settings)
    const night = this.settings.daylight === 'night'
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
    this.terrain.roadMaterial.color.set(profile.wet ? '#a8b4bd' : '#c4ccd1')
    this.terrain.roadMaterial.envMap = environment
    this.terrain.roadMaterial.envMapIntensity = profile.wet ? 0.8 : 0.2
    for (const [index, light] of this.headlights.entries())
      light.intensity =
        index < this.car.headlightPositions.length &&
        (night || this.settings.weather === 'fog' || this.settings.weather === 'rain')
          ? 65
          : 0
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
    this.lastTime = time
    this.pollController()
    let input = this.manualInput()
    if (
      !this.paused &&
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
      })
    }
    const p = this.physics
    this.water.update(p.x, p.s, time / 1000)
    this.precipitation.update(p.x, p.y, p.s, time / 1000)
    positionVehicle(this.car, p, this.settings.vehicle, dt)
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
      this.settings.daylight === 'night',
      p.speed,
    )
    const cameraMode = this.started ? this.settings.camera : 'cinematic'
    this.car.setExteriorVisible(cameraMode !== 'bonnet')
    this.view.controllerLook(this.controllerLook, cameraMode, dt)
    this.view.update(p, this.world, cameraMode, dt)
    if (p.impact > 0.005) {
      const seconds = time / 1000
      this.camera.rotateX(Math.sin(seconds * 41 + 1.3) * p.impact * impactShake.pitch)
      this.camera.rotateZ(Math.sin(seconds * 53) * p.impact * impactShake.roll)
    }
    this.terrain.update(p.s, time / 1000, -this.camera.position.z, p.x)
    this.sky.position.copy(this.camera.position)
    if (this.sky.material.uniforms.time) this.sky.material.uniforms.time.value = time / 1000
    this.sun.position.set(p.x + sunOffset.x, p.y + this.sunHeight, -p.s + sunOffset.z)
    this.sun.target.position.set(p.x, p.y, -p.s - 15)
    this.audio.update(p, input, this.settings, this.paused || !this.started, dt)
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
    this.renderer.render(this.scene, this.camera)
    this.antialiasing?.render(this.renderer)
  }
  screenshot() {
    const link = document.createElement('a')
    link.download = 'slow-roads.png'
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
    this.atmosphere.dispose()
    this.car.dispose()
    for (const light of this.headlights) light.dispose()
    this.sky.geometry.dispose()
    this.sky.material.dispose()
    this.sun.shadow.dispose()
    this.audio.dispose()
    this.antialiasing?.dispose()
    this.crossfade.dispose()
    this.renderer.dispose()
  }
}
