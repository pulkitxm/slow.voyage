import { useCallback, useEffect, useRef, useState } from 'react'
import { type DriveState, RoadEngine } from './game/engine'
import { cameras, loadSettings } from './game/settings'
import { defaults, type Settings } from './game/world'

const initial: DriveState = {
  speed: 0,
  distance: 0,
  altitude: 0,
  steering: 0,
  slip: 0,
  offroad: false,
  gear: 'N',
  impact: 0,
  autodrive: false,
  paused: false,
  fps: 60,
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
  const [tab, setTab] = useState<'journey' | 'vehicle' | 'display'>('journey')
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
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const next = { ...settingsRef.current, [key]: value }
    settingsRef.current = next
    engine.current?.setSettings(next)
    setSettings(next)
    try {
      localStorage.setItem('slowroads-settings', JSON.stringify(next))
    } catch {}
  }
  const start = (auto = false) => {
    engine.current?.start(auto)
    setStarted(true)
    setPanel(false)
  }
  const pause = () => {
    if (!engine.current?.started) return
    engine.current.paused = !engine.current.paused
    setState((current) => ({ ...current, paused: engine.current?.paused ?? false }))
  }
  const toggleAuto = () => {
    if (!engine.current) return
    if (!engine.current.started) start(true)
    else engine.current.autodrive = !engine.current.autodrive
    announce(engine.current.autodrive ? 'Autodrive on. Enjoy the view.' : 'You have the wheel.')
  }
  const cycleCamera = () => {
    if (!engine.current) return
    const next =
      cameras[(cameras.indexOf(engine.current.settings.camera) + 1) % cameras.length] ?? 'chase'
    update('camera', next)
    announce(`${next === 'bonnet' ? 'Bonnet' : next === 'chase' ? 'Chase' : 'Cinematic'} camera`)
  }
  const handlers = useRef({ pause, toggleAuto, cycleCamera })
  handlers.current = { pause, toggleAuto, cycleCamera }
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
        if (action === 'camera') handlers.current.cycleCamera()
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
  const fullscreen = () => {
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => announce('Fullscreen is unavailable'))
    else
      void document.documentElement
        .requestFullscreen()
        .catch(() => announce('Fullscreen is unavailable'))
  }
  const touch = (key: 'throttle' | 'brake' | 'steer', value: number) => {
    if (!engine.current) return
    engine.current.touch[key] = value
    if (value) engine.current.autodrive = false
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
