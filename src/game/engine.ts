import * as THREE from 'three'
import { DriveAudio } from './audio'
import { createVehicleModel, type VehicleModel } from './model'
import { CarPhysics, type Input, type Telemetry } from './physics'
import { Terrain } from './terrain'
import { vehicleMetrics } from './vehicles'
import { Water } from './water'
import { angleDifference, clamp, damp, defaults, type Settings, World } from './world'

export interface DriveState extends Telemetry {
  autodrive: boolean
  paused: boolean
  fps: number
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
  sun = new THREE.DirectionalLight('#fff3d5', 2.5)
  ambient = new THREE.HemisphereLight('#dae9ec', '#9ba47c', 1.9)
  headlights: THREE.SpotLight[] = []
  sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>
  frame = 0
  started = false
  paused = false
  autodrive = false
  cruiseSpeed = 22
  keys = new Set<string>()
  touch: Input = { throttle: 0, brake: 0, steer: 0, handbrake: false }
  lastTime = 0
  accumulator = 0
  lastTelemetry = 0
  cameraYaw = 0
  cameraAnchor = new THREE.Vector3()
  cameraReady = false
  disposed = false
  onState?: (state: DriveState) => void
  onAction?: (action: 'pause' | 'auto' | 'camera' | 'help') => void
  resize = () => {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
  }
  keyDown = (event: KeyboardEvent) => {
    if (document.querySelector('dialog[open]')) return
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
    if (
      ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
        event.code,
      )
    )
      this.autodrive = false
    if (event.code === 'KeyF') this.onAction?.('auto')
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
    this.touch = { throttle: 0, brake: 0, steer: 0, handbrake: false }
  }
  visibility = () => {
    this.lastTime = 0
    this.accumulator = 0
    if (document.hidden) this.blur()
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
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, this.settings.quality === 'low' ? 1 : 1.7),
    )
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.1
    this.scene.fog = new THREE.FogExp2('#d3ddd2', 0.00095)
    this.scene.add(this.ambient, this.sun, this.sun.target)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
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
          time: { value: 0 },
        },
        vertexShader:
          'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:
          'varying vec3 direction;uniform vec3 top;uniform vec3 horizon;uniform float clouds;uniform float time;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}void main(){vec3 d=normalize(direction);float h=max(d.y,0.);vec3 color=mix(horizon,top,pow(h,.5));vec2 p=d.xz/max(.12,d.y)*1.4+time*.0005;float n=noise(p)*.55+noise(p*2.3)*.28+noise(p*5.)*.17;float c=smoothstep(.52,.8,n)*smoothstep(.03,.3,h)*clouds;color=mix(color,vec3(.98,.97,.91),c*.65);gl_FragColor=vec4(color,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
      }),
    )
    this.sky.frustumCulled = false
    this.scene.add(this.sky)
    this.water = new Water(this.scene)
    this.terrain = new Terrain(this.scene, this.world)
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
    this.frame = requestAnimationFrame(this.render)
  }
  start(auto = false) {
    this.started = true
    this.autodrive = auto
    this.paused = false
    this.audio.start(this.settings.volume)
    this.physics.distance = 0
    if (!auto) this.physics.speed = 0
  }
  reset() {
    this.physics.reset()
    this.cameraReady = false
  }
  setSettings(settings: Settings) {
    const refresh =
      settings.season !== this.settings.season ||
      settings.landscape !== this.settings.landscape ||
      settings.quality !== this.settings.quality ||
      settings.seed !== this.settings.seed
    const vehicleChange = settings.vehicle !== this.settings.vehicle
    this.settings = { ...settings }
    this.world.settings = this.settings
    if (refresh) this.terrain.refresh(this.settings)
    if (vehicleChange) {
      this.scene.remove(this.car.group)
      this.car.dispose()
      this.car = createVehicleModel(this.settings)
      this.scene.add(this.car.group)
      this.configureHeadlights()
      this.cameraReady = false
    }
    this.car.body.color.set(settings.color)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, settings.quality === 'low' ? 1 : 1.7))
    this.applyLighting()
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
    const time = this.settings.daylight,
      night = time === 'night',
      sunset = time === 'sunset'
    const horizon = night ? '#283a4a' : sunset ? '#ebbd94' : '#e5eeeb'
    this.sky.material.uniforms.top?.value.set(night ? '#111c31' : sunset ? '#8e9fae' : '#abd2e2')
    this.sky.material.uniforms.horizon?.value.set(horizon)
    if (this.sky.material.uniforms.clouds)
      this.sky.material.uniforms.clouds.value = night ? 0.02 : 0.7
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.set(horizon)
      this.scene.fog.density = night ? 0.0018 : 0.00095
    }
    this.sun.color.set(night ? '#9cb4dc' : sunset ? '#ffd09d' : '#fffaf0')
    this.sun.intensity = night ? 0.45 : sunset ? 2.1 : 2.6
    this.ambient.intensity = night ? 0.65 : 1.9
    this.renderer.toneMappingExposure = night ? 0.78 : 1.05
    for (const light of this.headlights) light.intensity = night ? 65 : 0
  }
  manualInput(): Input {
    const has = (...codes: string[]) => codes.some((c) => this.keys.has(c))
    return {
      throttle: has('KeyW', 'ArrowUp') ? 1 : this.touch.throttle,
      brake: has('KeyS', 'ArrowDown') ? 1 : this.touch.brake,
      steer: has('KeyA', 'ArrowLeft') ? 1 : has('KeyD', 'ArrowRight') ? -1 : this.touch.steer,
      handbrake: has('Space') || this.touch.handbrake,
    }
  }
  render = (time: number) => {
    if (this.disposed) return
    this.frame = requestAnimationFrame(this.render)
    const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.05) : 1 / 60
    this.lastTime = time
    let input = this.manualInput()
    if (!this.paused && !document.hidden) {
      this.accumulator += dt
      while (this.accumulator >= 1 / 120) {
        input =
          !this.started || this.autodrive
            ? this.physics.autoInput(this.started ? this.cruiseSpeed : 10)
            : this.manualInput()
        this.physics.update(1 / 120, input, this.settings)
        this.accumulator -= 1 / 120
      }
    }
    const p = this.physics
    const metrics = vehicleMetrics[this.settings.vehicle]
    const isBike = this.settings.vehicle === 'motorcycle'
    const isBus = this.settings.vehicle === 'bus'
    this.terrain.update(p.s, time / 1000)
    this.water.update(p.x, p.s, time / 1000)
    this.car.group.position.set(p.x, p.y, -p.s)
    this.car.group.rotation.order = 'YXZ'
    this.car.group.rotation.y = p.yaw
    const axle = metrics.wheelbase * 0.5
    const front = this.world.height(p.x - Math.sin(p.yaw) * axle, p.s + Math.cos(p.yaw) * axle)
    const rear = this.world.height(p.x + Math.sin(p.yaw) * axle, p.s - Math.cos(p.yaw) * axle)
    this.car.group.rotation.x = damp(
      this.car.group.rotation.x,
      Math.atan2(front - rear, metrics.wheelbase) + input.throttle * 0.008 - input.brake * 0.025,
      8,
      dt,
    )
    const lean = isBike
      ? clamp(Math.atan((p.yawRate * p.speed) / 9.81), -0.65, 0.65)
      : -p.yawRate * p.speed * 0.003
    this.car.group.rotation.z = damp(this.car.group.rotation.z, lean, 5, dt)
    this.car.update(
      this.paused ? 0 : p.speed,
      p.steering,
      input.brake > 0,
      this.settings.daylight === 'night',
      dt,
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
    if (!this.lastTelemetry || time - this.lastTelemetry > 100) {
      this.onState?.({
        ...p.telemetry(),
        autodrive: this.autodrive,
        paused: this.paused,
        fps: Math.round(1 / dt),
      })
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
    this.terrain.dispose()
    this.water.dispose()
    this.car.dispose()
    for (const light of this.headlights) light.dispose()
    this.sky.geometry.dispose()
    this.sky.material.dispose()
    this.sun.shadow.dispose()
    this.audio.dispose()
    this.renderer.dispose()
  }
}
