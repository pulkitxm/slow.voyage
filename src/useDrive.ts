import { useCallback, useEffect, useRef, useState } from 'react'
import type { SettingsTab } from './components/SettingsPanel'
import { assistanceLabels } from './game/controls'
import { adjustCruiseSpeed } from './game/cruise'
import { type DriveState, RoadEngine } from './game/engine'
import { nextJourney } from './game/journeys'
import { cameras, loadSettings } from './game/settings'
import { vehicleNames } from './game/vehicles'
import { defaults, type Settings } from './game/world'

const initial: DriveState = {
  speed: 0,
  boost: false,
  distance: 0,
  altitude: 0,
  steering: 0,
  slip: 0,
  offroad: false,
  gear: 'N',
  impact: 0,
  assistance: 'off',
  paused: false,
  fps: 60,
  controller: 'none',
  mouseSteering: 0,
}
export function useDrive() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const engine = useRef<RoadEngine | null>(null)
  const [settings, setSettings] = useState<Settings>(defaults)
  const [state, setState] = useState(initial)
  const [started, setStarted] = useState(false)
  const [ready, setReady] = useState(false)
  const [panel, setPanel] = useState(false)
  const [help, setHelp] = useState(false)
  const [tab, setTab] = useState<SettingsTab>('journey')
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
      localStorage.setItem('slowroads-settings', JSON.stringify(next))
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
    const vehicles = ['touring', 'roadster', 'motorcycle', 'bus'] as const
    const next =
      vehicles[
        (vehicles.indexOf(settingsRef.current.vehicle) + direction + vehicles.length) %
          vehicles.length
      ] ?? 'touring'
    update('vehicle', next)
    announce(vehicleNames[next])
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
  const handlers = useRef({
    pause,
    toggleAuto,
    cycleCamera,
    cycleAssistance,
    adjustCruise,
    toggleMouse,
    cycleJourney,
    cycleVehicle,
  })
  handlers.current = {
    pause,
    toggleAuto,
    cycleCamera,
    cycleAssistance,
    adjustCruise,
    toggleMouse,
    cycleJourney,
    cycleVehicle,
  }
  useEffect(() => {
    if (!canvas.current) return
    let rendered = false
    setReady(false)
    const loaded = loadSettings()
    setSettings(loaded)
    settingsRef.current = loaded
    try {
      const instance = new RoadEngine(canvas.current, loaded)
      engine.current = instance
      instance.onError = () =>
        setError('The renderer could not prepare the road. Reload to try again.')
      instance.onState = (state) => {
        if (!rendered) {
          rendered = true
          setReady(true)
        }
        setState(state)
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
        if (action === 'journeyNext') handlers.current.cycleJourney(1)
        if (action === 'journeyPrevious') handlers.current.cycleJourney(-1)
        if (action === 'vehicleNext') handlers.current.cycleVehicle(1)
        if (action === 'vehiclePrevious') handlers.current.cycleVehicle(-1)
        if (action === 'help') setHelp((current) => !current)
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
      engine.current?.dispose()
      engine.current = null
      window.removeEventListener('online', connection)
      window.removeEventListener('offline', connection)
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [announce])
  useEffect(() => {
    engine.current?.setControlsBlocked(panel || help)
  }, [panel, help])
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
    engine,
    settings,
    state,
    started,
    ready,
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
    start,
    pause,
    toggleAuto,
    cycleCamera,
    fullscreen,
    touch,
  }
}
