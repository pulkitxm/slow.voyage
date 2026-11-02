import * as THREE from 'three'
import { Atmosphere, atmosphereProfile } from './atmosphere'
import { DriveAudio } from './audio'
import { mergeManualInput, neutralInput, releaseAssistance, resolveInput } from './controls'
import { type ControllerStatus, GamepadControls } from './gamepad'
import { graphicsBudget } from './graphics'
import { createVehicleModel, type VehicleModel } from './model'
import { MouseControls } from './mouse'
import { CarPhysics, type Input, type Telemetry } from './physics'
import { Precipitation } from './precipitation'
import { SimulationClock } from './simulation-clock'
import { Terrain } from './terrain'
import { vehicleMetrics } from './vehicles'
import { Water } from './water'
import {
  type AssistanceMode,
  angleDifference,
  clamp,
  damp,
  defaults,
  type Settings,
  World,
} from './world'

export interface DriveState extends Telemetry {
  assistance: AssistanceMode
  paused: boolean
  fps: number
  controller: ControllerStatus
  mouseSteering: number
}
export class RoadEngine {
  renderer: THREE.WebGLRenderer
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
  sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>
  frame = 0
  started = false
  paused = false
  assistance: AssistanceMode = 'off'
  controlsBlocked = false
  keys = new Set<string>()
  touch: Input = { ...neutralInput }
  controller = new GamepadControls()
  controllerInput: Input = { ...neutralInput }
  controllerStatus: ControllerStatus = 'none'
  mouse = new MouseControls()
  lastTime = 0
  simulation = new SimulationClock()
  lastTelemetry = 0
  cameraYaw = 0
  cameraAnchor = new THREE.Vector3()
  cameraReady = false
  disposed = false
  rendered = false
  frameRate = 60
  onState?: (state: DriveState) => void
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
    if (this.controlsBlocked || document.querySelector('dialog[open]')) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (
      event.target instanceof HTMLElement &&
      ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)
    )
      return
    if (event.target instanceof HTMLButtonElement && ['Space', 'Enter'].includes(event.code)) return
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code))
      event.preventDefault()
    if (event.repeat) return
    this.keys.add(event.code)
    if (!this.started && ['KeyW', 'ArrowUp'].includes(event.code)) this.start()
    if (['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown'].includes(event.code)) this.manualOverride('speed')
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
    this.controller.suspend()
    this.mouse.reset()
  }
  visibility = () => {
    this.lastTime = 0
    this.simulation.reset()
    if (document.hidden) this.blur()
  }
  pointerMove = (event: PointerEvent) => {
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
  }
  pointerCancel = () => this.mouse.reset()
  pointerLeave = () => {
    if (!this.mouse.buttons) this.mouse.reset()
  }
  contextMenu = (event: Event) => {
    if (this.settings.mouseEnabled) event.preventDefault()
  }
  constructor(
    public canvas: HTMLCanvasElement,
    settings: Settings = defaults,
  ) {
    this.settings = { ...settings }
    this.world = new World(this.settings)
    this.physics = new CarPhysics(this.world)
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    })
    const budget = graphicsBudget(this.renderer, this.settings.quality)
    this.renderer.setPixelRatio(budget.pixelRatio)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.1
    this.scene.fog = new THREE.FogExp2('#d3ddd2', 0.00095)
    this.scene.add(this.ambient, this.sun, this.sun.target)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(budget.shadowSize, budget.shadowSize)
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -75
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 75
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 350
    this.sun.shadow.normalBias = 0.05
    this.sun.shadow.bias = -0.00015
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(2800, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color('#8dbac7') },
          horizon: { value: new THREE.Color('#e1e5d1') },
          clouds: { value: 0.5 },
          cloudColor: { value: new THREE.Color('#e9ece8') },
          time: { value: 0 },
        },
        vertexShader:
          'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:
          'varying vec3 direction;uniform vec3 top;uniform vec3 horizon;uniform vec3 cloudColor;uniform float clouds;uniform float time;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}void main(){vec3 d=normalize(direction);float h=max(d.y,0.);vec3 color=mix(horizon,top,pow(h,.5));vec2 p=d.xz/max(.12,d.y)*1.4+time*.0005;float n=noise(p)*.55+noise(p*2.3)*.28+noise(p*5.)*.17;float c=smoothstep(mix(.58,.2,clouds),mix(.87,.75,clouds),n)*smoothstep(.03,.3,h);color=mix(color,cloudColor,c*.65);gl_FragColor=vec4(color,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
      }),
    )
    this.sky.frustumCulled = false
    this.scene.add(this.sky)
    this.water = new Water(this.scene)
    this.terrain = new Terrain(this.scene, this.world, budget.detail)
    this.atmosphere = new Atmosphere(this.renderer)
    this.precipitation = new Precipitation(this.scene)
    this.car = createVehicleModel(this.settings)
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
    this.frame = requestAnimationFrame(this.render)
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
  setTouch(key: 'throttle' | 'brake' | 'steer', value: number) {
    if (this.controlsBlocked) return
    this.touch[key] = value
    if (value) this.manualOverride(key === 'steer' ? 'steer' : 'speed')
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
    this.physics.reset()
    this.cameraReady = false
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
    this.settings = { ...settings }
    this.world.settings = this.settings
    if (roadChange) {
      const speed = this.physics.speed
      this.physics.reset()
      this.physics.speed = speed
      this.cameraReady = false
    }
    if (mouseChange) this.mouse.reset()
    if (refresh) this.terrain.refresh(this.settings, budget.detail)
    if (vehicleChange) {
      this.scene.remove(this.car.group)
      this.car.dispose()
      this.car = createVehicleModel(this.settings)
      this.scene.add(this.car.group)
      this.configureHeadlights()
      this.cameraReady = false
      this.physics.suspension.configure(settings.vehicle)
      this.physics.suspension.reset(this.physics)
    }
    this.car.body.color.set(settings.color)
    this.renderer.setPixelRatio(budget.pixelRatio)
    if (this.sun.shadow.mapSize.x !== budget.shadowSize) {
      this.sun.shadow.mapSize.set(budget.shadowSize, budget.shadowSize)
      this.sun.shadow.map?.dispose()
      this.sun.shadow.map = null
    }
    this.applyLighting()
    if (assistanceChange && this.assistance !== 'off') this.setAssistance(settings.autodriveMode)
  }
  configureHeadlights() {
    for (const light of this.headlights) {
      light.removeFromParent()
      light.target.removeFromParent()
      light.dispose()
    }
    this.headlights = this.car.headlightPositions.map((position) => {
      const light = new THREE.SpotLight('#fff0cf', 40, 100, 0.42, 0.6, 1)
      light.position.set(...position)
      light.target.position.set(position[0] * 2, -0.5, position[2] - 45)
      this.car.group.add(light, light.target)
      return light
    })
  }
  applyLighting() {
    this.water.setAppearance(this.settings.daylight, this.settings.season === 'winter')
    const profile = atmosphereProfile(this.settings)
    const environment = this.atmosphere.setAppearance(this.settings)
    this.scene.environment = environment
    this.scene.environmentIntensity = 0.35
    this.car.group.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshPhysicalMaterial) {
        object.material.envMap = environment
        object.material.envMapIntensity = 0.9
      }
    })
    this.precipitation.setAppearance(this.settings)
    const night = this.settings.daylight === 'night'
    this.sky.material.uniforms.top?.value.set(profile.sky)
    this.sky.material.uniforms.horizon?.value.set(profile.horizon)
    this.sky.material.uniforms.cloudColor?.value.set(
      this.settings.weather === 'clear' ? '#e9ece8' : profile.horizon,
    )
    if (this.sky.material.uniforms.clouds) this.sky.material.uniforms.clouds.value = profile.clouds
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
    for (const light of this.headlights)
      light.intensity =
        night || this.settings.weather === 'fog' || this.settings.weather === 'rain' ? 65 : 0
  }
  manualInput(): Input {
    if (this.controlsBlocked) return { ...neutralInput }
    const has = (...codes: string[]) => codes.some((c) => this.keys.has(c))
    return mergeManualInput(
      {
        ...neutralInput,
        throttle: has('KeyW', 'ArrowUp') ? 1 : 0,
        brake: has('KeyS', 'ArrowDown') ? 1 : 0,
        steer: (has('KeyA', 'ArrowLeft') ? 1 : 0) - (has('KeyD', 'ArrowRight') ? 1 : 0),
        handbrake: has('Space'),
      },
      this.touch,
      this.controllerInput,
      this.settings.mouseEnabled ? this.mouse.input() : null,
    )
  }
  pollController() {
    this.controllerInput = { ...neutralInput }
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
      const frame = this.controller.read(navigator.getGamepads(), this.settings.controllerDeadzone)
      this.controllerStatus = frame.status
      if (blocked) return
      this.controllerInput = frame.input
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
        const automatic = this.physics.autoInput(this.started ? this.settings.cruiseSpeed : 10)
        input = !this.started
          ? automatic
          : resolveInput(this.manualInput(), automatic, this.assistance, this.settings.onePedal)
        this.physics.update(step, input, this.settings)
      })
    }
    const p = this.physics
    const metrics = vehicleMetrics[this.settings.vehicle]
    const isBike = this.settings.vehicle === 'motorcycle'
    const isBus = this.settings.vehicle === 'bus'
    this.terrain.update(p.s, time / 1000)
    this.water.update(p.x, p.s, time / 1000)
    this.precipitation.update(p.x, p.y, p.s, time / 1000)
    this.car.group.position.set(p.x, p.y, -p.s)
    this.car.group.rotation.order = 'YXZ'
    this.car.group.rotation.y = p.yaw
    this.car.group.rotation.x = p.pitch
    this.car.group.rotation.z = isBike
      ? damp(
          this.car.group.rotation.z,
          clamp(Math.atan((p.yawRate * p.speed) / 9.81), -0.65, 0.65),
          5,
          dt,
        )
      : p.roll
    this.car.update(
      p.suspension.wheels,
      input.brake > 0 || input.regenBrake > 0,
      this.settings.daylight === 'night',
    )
    const cameraMode = this.started ? this.settings.camera : 'cinematic'
    this.car.setExteriorVisible(cameraMode !== 'bonnet')
    this.cameraYaw +=
      angleDifference(p.yaw, this.cameraYaw) * (this.cameraReady ? 1 - Math.exp(-3 * dt) : 1)
    const yaw = this.cameraYaw,
      f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)),
      side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
    const position = new THREE.Vector3(p.x, p.y, -p.s)
    const target = position.clone().addScaledVector(f, cameraMode === 'bonnet' ? 35 : 15)
    target.y += cameraMode === 'bonnet' ? 1.2 : 1.0
    if (cameraMode === 'bonnet')
      position
        .addScaledVector(f, 0.9)
        .add(new THREE.Vector3(0, isBus ? 2.5 : isBike ? 1.1 : 1.45, 0))
    else if (cameraMode === 'cinematic')
      position
        .addScaledVector(f, -12)
        .addScaledVector(side, -8)
        .add(new THREE.Vector3(0, 5.5, 0))
    else
      position
        .addScaledVector(
          f,
          isBus
            ? -9 - 2 * clamp(Math.abs(p.speed) / 32, 0, 1)
            : isBike
              ? -3.5 - clamp(Math.abs(p.speed) / 50, 0, 1)
              : -4.2 - Math.abs(p.speed) * 0.01,
        )
        .add(new THREE.Vector3(0, isBus ? 4.7 : isBike ? 1.8 : 2.0, 0))
    position.y = Math.max(position.y, this.world.height(position.x, -position.z) + 1)
    if (cameraMode === 'chase' && !isBus) {
      const pitch = 0.3 - clamp(Math.abs(p.speed) / metrics.maxSpeed, 0, 1) * 0.1
      target.copy(position).addScaledVector(f, 30)
      target.y += this.world.road(p.s + 20).y - p.y - Math.tan(pitch) * 30
    }
    if (this.cameraReady) {
      this.camera.position.x += p.x - this.cameraAnchor.x
      this.camera.position.y += p.y - this.cameraAnchor.y
      this.camera.position.z += -p.s - this.cameraAnchor.z
    }
    this.cameraAnchor.set(p.x, p.y, -p.s)
    this.camera.position.lerp(position, this.cameraReady ? 1 - Math.exp(-7 * dt) : 1)
    this.camera.lookAt(target)
    this.cameraReady = true
    this.sky.position.copy(this.camera.position)
    if (this.sky.material.uniforms.time) this.sky.material.uniforms.time.value = time / 1000
    this.sun.position.set(
      p.x - 90,
      p.y + (this.settings.daylight === 'sunset' ? 38 : 110),
      -p.s - 80,
    )
    this.sun.target.position.set(p.x, p.y, -p.s - 15)
    this.audio.update(p.speed, input.throttle, this.settings, this.paused || !this.started)
    this.renderer.render(this.scene, this.camera)
    this.rendered = true
    if (!this.lastTelemetry || time - this.lastTelemetry > 100) {
      this.emitState()
      this.lastTelemetry = time
    }
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
    this.renderer.dispose()
  }
}
