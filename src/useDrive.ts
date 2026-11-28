import { useCallback, useEffect, useRef, useState } from 'react'
import type { SettingsTab } from './components/SettingsPanel'
import { bodyFor } from './game/car-bodies'
import { assistanceLabels } from './game/controls'
import { adjustCruiseSpeed } from './game/cruise'
import { type DriveState, RoadEngine } from './game/engine'
import type { GarageJob } from './game/garage-session'
import { nextJourney } from './game/journeys'
import { landmarkNames } from './game/landmarks'
import { Odometer } from './game/odometer'
import { cameras, loadSettings } from './game/settings'
import { decodeSpot, encodeSpot } from './game/share'
import { supercarModelName } from './game/supercars'
import { vehicleNames } from './game/vehicles'
import { defaults, type Settings, vehicles } from './game/world'
import { TelemetryStore } from './telemetry'

const initial: DriveState = {
  speed: 0,
  boost: false,
  nitro: 1,
  distance: 0,
  altitude: 0,
  steering: 0,
  slip: 0,
  offroad: false,
  gear: 'N',
  revs: 0,
  limited: false,
  impact: 0,
  antilock: false,
  traction: false,
  stability: false,
  assistance: 'off',
  paused: false,
  fps: 60,
  controller: 'none',
  mouseSteering: 0,
  roadDistance: 0,
  roadBearing: 0,
  photo: false,
  found: 0,
  garageNear: false,
  garage: { phase: 'idle', job: null, progress: 0, step: '' },
  grime: 0,
}
export function useDrive() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const engine = useRef<RoadEngine | null>(null)
  const minimap = useCallback((node: HTMLCanvasElement | null) => {
    engine.current?.minimap.attach(node)
  }, [])
  const [settings, setSettings] = useState<Settings>(defaults)
  const [state, setState] = useState(initial)
  const [telemetry] = useState(() => new TelemetryStore(initial))
  const [started, setStarted] = useState(false)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState({ fraction: 0, stage: 'stone' })
  const [panel, setPanel] = useState(false)
  const [help, setHelp] = useState(false)
  const [tab, setTab] = useState<SettingsTab>('journey')
  const [lifetime, setLifetime] = useState(0)
  const [offline, setOffline] = useState(false)
  const [online, setOnline] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const announce = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2800)
  }, [])
  const settingsRef = useRef(settings)
  const applySettings = (changes: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...changes }
    settingsRef.current = next
    engine.current?.setSettings(next)
    setSettings(next)
    try {
      localStorage.setItem('slow-voyage-settings', JSON.stringify(next))
    } catch {}
  }
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    applySettings({ [key]: value })
  const cycleJourney = (direction: number) => {
    const next = nextJourney(settingsRef.current, direction)
    applySettings({
      landscape: next.landscape,
      season: next.season,
      daylight: next.daylight,
      weather: next.weather,
    })
    announce(next.name)
  }
  const cycleVehicle = (direction: number) => {
    const next =
      vehicles[
        (vehicles.indexOf(settingsRef.current.vehicle) + direction + vehicles.length) %
          vehicles.length
      ] ?? 'touring'
    update('vehicle', next)
    announce(
      bodyFor(settingsRef.current)?.name ??
        (next === 'supercar'
          ? `${vehicleNames[next]}: ${supercarModelName(settingsRef.current.supercarModel)}`
          : vehicleNames[next]),
    )
  }
  const start = (auto = false) => {
    const instance = engine.current
    if (!instance) return
    instance.start(auto ? settingsRef.current.autodriveMode : 'off')
    setStarted(true)
    setPanel(false)
  }
  const pause = () => {
    if (!engine.current?.started) return
    engine.current.setPaused(!engine.current.paused)
  }
  const toggleAuto = () => {
    if (!engine.current) return
    if (!engine.current.started) start(true)
    else
      engine.current.setAssistance(
        engine.current.assistance === 'off' ? settingsRef.current.autodriveMode : 'off',
      )
    const mode = engine.current.assistance
    announce(mode === 'off' ? 'Manual driving' : `${assistanceLabels[mode]} on`)
  }
  const cycleAssistance = () => {
    const modes = ['full', 'steer', 'speed'] as const
    const next =
      modes[(modes.indexOf(settingsRef.current.autodriveMode) + 1) % modes.length] ?? 'full'
    update('autodriveMode', next)
    announce(`${assistanceLabels[next]} selected.`)
  }
  const adjustCruise = (direction: number) => {
    const factor = settingsRef.current.units === 'km' ? 3.6 : 2.23694
    const speed = adjustCruiseSpeed(
      settingsRef.current.cruiseSpeed,
      direction,
      settingsRef.current.units,
    )
    update('cruiseSpeed', speed)
    announce(
      speed === 0
        ? 'Cruise stop selected'
        : `${speed < 0 ? 'Reverse cruise' : 'Cruise speed'} ${Math.round(Math.abs(speed) * factor)} ${settingsRef.current.units === 'km' ? 'km/h' : 'mph'}`,
    )
  }
  const cycleCamera = () => {
    if (!engine.current) return
    const next =
      cameras[(cameras.indexOf(engine.current.settings.camera) + 1) % cameras.length] ?? 'chase'
    update('camera', next)
    announce(`${next === 'bonnet' ? 'Bonnet' : next === 'chase' ? 'Chase' : 'Cinematic'} camera`)
  }
  const toggleMouse = () => {
    const enabled = !settingsRef.current.mouseEnabled
    update('mouseEnabled', enabled)
    announce(
      enabled ? 'Mouse driving on. Move to steer; click to accelerate.' : 'Mouse driving off.',
    )
  }
  const loudness = useRef(defaults.volume)
  const toggleMute = () => {
    const current = settingsRef.current.volume
    if (current) loudness.current = current
    const next = current ? 0 : loudness.current || defaults.volume
    update('volume', next)
    engine.current?.audio.start(next)
    announce(next ? 'Sound on.' : 'Sound muted.')
  }
  const enterGarage = () => {
    if (engine.current?.enterGarage()) {
      setPanel(false)
      setHelp(false)
    }
  }
  const leaveGarage = () => {
    engine.current?.leaveGarage()
  }
  const garageJob = (job: GarageJob) => {
    engine.current?.garageJob(job)
  }
  const togglePhoto = () => {
    const instance = engine.current
    if (!instance) return
    instance.setPhoto(!instance.photo)
    if (instance.photo) {
      setPanel(false)
      setHelp(false)
    }
  }
  const copyLink = () => {
    const instance = engine.current
    if (!instance) return
    const hash = encodeSpot({
      landscape: settingsRef.current.landscape,
      seed: settingsRef.current.seed,
      roadMode: settingsRef.current.roadMode,
      distance: instance.physics.s,
    })
    history.replaceState(null, '', hash)
    void navigator.clipboard
      ?.writeText(location.href)
      .then(() => announce('Link to this spot copied.'))
      .catch(() => announce('The link is in your address bar.'))
  }
  const handlers = useRef({
    togglePhoto,
    pause,
    toggleAuto,
    cycleCamera,
    cycleAssistance,
    adjustCruise,
    toggleMouse,
    toggleMute,
    cycleJourney,
    cycleVehicle,
    update,
    enterGarage,
    leaveGarage,
    applySettings,
  })
  handlers.current = {
    togglePhoto,
    pause,
    toggleAuto,
    cycleCamera,
    cycleAssistance,
    adjustCruise,
    toggleMouse,
    toggleMute,
    cycleJourney,
    cycleVehicle,
    update,
    enterGarage,
    leaveGarage,
    applySettings,
  }
  useEffect(() => {
    if (!canvas.current) return
    let rendered = false
    let shown = ''
    setReady(false)
    const odometer = new Odometer(window.localStorage)
    setLifetime(odometer.shown)
    const keepOdometer = () => odometer.keep()
    window.addEventListener('pagehide', keepOdometer)
    document.addEventListener('visibilitychange', keepOdometer)
    const spot = decodeSpot(location.hash)
    const loaded = {
      ...loadSettings(),
      ...(spot && {
        landscape: spot.landscape,
        seed: spot.seed,
        roadMode: spot.roadMode ?? 'winding',
      }),
    }
    setSettings(loaded)
    settingsRef.current = loaded
    try {
      const instance = new RoadEngine(canvas.current, loaded)
      engine.current = instance
      if (import.meta.env.DEV) Reflect.set(window, 'voyage', instance)
      if (spot) instance.travelTo(spot.distance)
      instance.onProgress = (fraction, stage) => setLoading({ fraction, stage })
      instance.workshop.onCustomize = (changes) => handlers.current.applySettings(changes)
      instance.onDiscover = (kind, found) =>
        announce(`You found ${landmarkNames[kind]}. ${found} found so far.`)
      instance.onQuality = (quality) => {
        handlers.current.update('quality', quality)
        announce('Ultra detail eased to Full beauty to keep the drive smooth.')
      }
      instance.onError = () =>
        setError('The renderer could not prepare the road. Reload to try again.')
      instance.onState = (state) => {
        if (!rendered) {
          rendered = true
          setReady(true)
        }
        telemetry.set(state)
        const steady = `${state.paused}/${state.photo}/${state.assistance}/${state.controller}/${state.found}/${state.garageNear}/${state.garage.phase}/${state.garage.job}/${state.garage.step}/${state.garage.progress.toFixed(2)}/${state.grime.toFixed(2)}`
        if (steady !== shown) {
          shown = steady
          setState(state)
        }
        if (instance.started && odometer.record(state.distance)) setLifetime(odometer.shown)
        if (instance.started) setStarted(true)
      }
      instance.onAction = (action) => {
        if (action === 'pause') handlers.current.pause()
        if (action === 'auto') handlers.current.toggleAuto()
        if (action === 'autoMode') handlers.current.cycleAssistance()
        if (action === 'cruiseUp') handlers.current.adjustCruise(1)
        if (action === 'cruiseDown') handlers.current.adjustCruise(-1)
        if (action === 'camera') handlers.current.cycleCamera()
        if (action === 'mouse') handlers.current.toggleMouse()
        if (action === 'mute') handlers.current.toggleMute()
        if (action === 'journeyNext') handlers.current.cycleJourney(1)
        if (action === 'journeyPrevious') handlers.current.cycleJourney(-1)
        if (action === 'vehicleNext') handlers.current.cycleVehicle(1)
        if (action === 'vehiclePrevious') handlers.current.cycleVehicle(-1)
        if (action === 'help') setHelp((current) => !current)
        if (action === 'photo') handlers.current.togglePhoto()
        if (action === 'garage') handlers.current.enterGarage()
        if (action === 'garageLeave') handlers.current.leaveGarage()
      }
    } catch {
      setError(
        'The road needs WebGL to render. Enable hardware acceleration in your browser, then reload to try again.',
      )
    }
    const connection = () => setOnline(navigator.onLine)
    connection()
    window.addEventListener('online', connection)
    window.addEventListener('offline', connection)
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      void navigator.serviceWorker
        .register('/sw.js')
        .then(async (registration) => {
          await navigator.serviceWorker.ready
          const worker = registration.installing ?? registration.waiting
          if (!worker) setOffline(true)
          else
            worker.addEventListener('statechange', () => {
              if (worker.state === 'activated') setOffline(true)
            })
        })
        .catch(() => announce('Offline download unavailable. You can still drive online.'))
    }
    return () => {
      odometer.keep()
      window.removeEventListener('pagehide', keepOdometer)
      document.removeEventListener('visibilitychange', keepOdometer)
      engine.current?.dispose()
      engine.current = null
      window.removeEventListener('online', connection)
      window.removeEventListener('offline', connection)
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [announce, telemetry.set])
  useEffect(() => {
    engine.current?.setControlsBlocked(panel || help)
  }, [panel, help])
  useEffect(() => {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', settings.daylight === 'night' ? '#121a16' : '#73856d')
  }, [settings.daylight])
  const fullscreen = () => {
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => announce('Fullscreen is unavailable'))
    else
      void document.documentElement
        .requestFullscreen()
        .catch(() => announce('Fullscreen is unavailable'))
  }
  const touch = (key: 'throttle' | 'brake' | 'steer' | 'boost', value: number) => {
    if (!engine.current) return
    engine.current.setTouch(key, value)
  }
  return {
    canvas,
    minimap,
    engine,
    settings,
    state,
    telemetry,
    lifetime,
    started,
    ready,
    loading,
    panel,
    setPanel,
    help,
    setHelp,
    tab,
    setTab,
    offline,
    online,
    error,
    setError,
    toast,
    announce,
    update,
    apply: applySettings,
    start,
    pause,
    toggleAuto,
    cycleCamera,
    cycleVehicle,
    togglePhoto,
    toggleMute,
    copyLink,
    fullscreen,
    touch,
    enterGarage,
    leaveGarage,
    garageJob,
  }
}
