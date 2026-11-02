import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BusFront,
  Camera,
  CarFront,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CloudSun,
  Expand,
  Gauge,
  Keyboard,
  Leaf,
  Moon,
  Mountain,
  Pause,
  Play,
  RotateCcw,
  Route,
  Settings2,
  ShieldCheck,
  Snowflake,
  Sun,
  Sunset,
  Trees,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from './components/Modal'
import { vehicleNames } from './game/car'
import { type DriveState, RoadEngine } from './game/engine'
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
const landscapes = [
  {
    id: 'highlands',
    title: 'The Highlands',
    subtitle: 'Rolling hills. Open horizons.',
    icon: Trees,
  },
  {
    id: 'alpine',
    title: 'Alpine Pass',
    subtitle: 'A little closer to the clouds.',
    icon: Mountain,
  },
  { id: 'desert', title: 'Desert Highway', subtitle: 'Quiet sands. Endless skies.', icon: Sun },
] as const
const seasons = [
  { id: 'summer', label: 'Summer', icon: Sun },
  { id: 'autumn', label: 'Autumn', icon: Leaf },
  { id: 'winter', label: 'Winter', icon: Snowflake },
] as const
const daylight = [
  { id: 'day', label: 'Daylight', icon: CloudSun },
  { id: 'sunset', label: 'Golden hour', icon: Sunset },
  { id: 'night', label: 'Night', icon: Moon },
] as const
const vehicles = [
  { id: 'touring', icon: CarFront },
  { id: 'roadster', icon: Gauge },
  { id: 'bus', icon: BusFront },
] as const
const cameras = ['chase', 'bonnet', 'cinematic'] as const
const colors = ['#edece3', '#6f8a77', '#b65a44', '#3b515c', '#c8aa66', '#343b39']
function loadSettings(): Settings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem('slowroads-settings') ?? 'null')
    if (!stored || typeof stored !== 'object') return { ...defaults }
    const result = { ...defaults }
    const values = stored as Record<string, unknown>
    for (const key of [
      'landscape',
      'season',
      'daylight',
      'vehicle',
      'camera',
      'quality',
      'units',
    ] as const) {
      const options: Record<typeof key, readonly string[]> = {
        landscape: landscapes.map((x) => x.id),
        season: seasons.map((x) => x.id),
        daylight: daylight.map((x) => x.id),
        vehicle: vehicles.map((x) => x.id),
        camera: cameras,
        quality: ['high', 'low'],
        units: ['km', 'mi'],
      }
      if (typeof values[key] === 'string' && options[key].includes(values[key]))
        Object.assign(result, { [key]: values[key] })
    }
    for (const key of ['volume', 'grip', 'power', 'seed'] as const)
      if (typeof values[key] === 'number' && Number.isFinite(values[key])) {
        const range = key === 'volume' ? [0, 1] : key === 'seed' ? [0, 99999] : [0.5, 2]
        Object.assign(result, {
          [key]: Math.max(range[0] ?? 0, Math.min(range[1] ?? 1, values[key])),
        })
      }
    if (typeof values.color === 'string' && /^#[0-9a-f]{6}$/i.test(values.color))
      result.color = values.color
    return result
  } catch {
    return { ...defaults }
  }
}
function IconButton({
  label,
  children,
  onClick,
  active = false,
}: {
  label: string
  children: React.ReactNode
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? 'active' : ''}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
export function Drive() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const engine = useRef<RoadEngine | null>(null)
  const [settings, setSettings] = useState<Settings>(defaults)
  const [state, setState] = useState(initial)
  const [started, setStarted] = useState(false)
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
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((current) => {
      const next = { ...current, [key]: value }
      engine.current?.setSettings(next)
      try {
        localStorage.setItem('slowroads-settings', JSON.stringify(next))
      } catch {}
      return next
    })
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
    const loaded = loadSettings()
    setSettings(loaded)
    try {
      const instance = new RoadEngine(canvas.current, loaded)
      engine.current = instance
      instance.onState = (state) => {
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
  const speed = Math.abs(state.speed) * (settings.units === 'km' ? 3.6 : 2.23694)
  const distance = state.distance / (settings.units === 'km' ? 1000 : 1609.344)
  const landscape = landscapes.find((x) => x.id === settings.landscape) ?? landscapes[0]
  return (
    <main className={`drive ${started ? 'is-driving' : 'is-welcome'} ${panel ? 'panel-open' : ''}`}>
      <canvas
        ref={canvas}
        aria-label="Interactive 3D scenic driving game. Use W A S D or arrow keys to drive."
      />
      <div className="scene-shade" />
      <header className="topbar">
        <a href="/" className="brand" aria-label="Slow Roads home">
          slow roads<span>TAKE THE LONG WAY HOME</span>
        </a>
        <div className="location">
          <span className="location-dot" />
          <span>{landscape.title}</span>
          <span className="location-divider" />
          <span>
            {settings.daylight === 'day'
              ? 'A clear afternoon'
              : settings.daylight === 'sunset'
                ? 'The golden hour'
                : 'Under the stars'}
          </span>
        </div>
        <div className="top-actions">
          <span
            className="offline-status"
            title={
              offline
                ? 'Ready to play without an internet connection'
                : online
                  ? 'Everything runs on your device'
                  : 'You are offline'
            }
          >
            <span className="status-dot" />
            {offline ? 'Offline ready' : online ? 'Free to wander' : 'Offline'}
          </span>
          <IconButton
            label={settings.volume ? 'Mute sound' : 'Unmute sound'}
            onClick={() => {
              update('volume', settings.volume ? 0 : 0.25)
              engine.current?.audio.start(settings.volume ? 0 : 0.25)
            }}
          >
            {settings.volume ? <Volume2 /> : <VolumeX />}
          </IconButton>
          <IconButton label="Fullscreen" onClick={fullscreen}>
            <Expand />
          </IconButton>
          <IconButton
            label="Open settings"
            active={panel}
            onClick={() => setPanel((current) => !current)}
          >
            <Settings2 />
          </IconButton>
        </div>
      </header>
      {!started && (
        <section className="intro" aria-label="Welcome to Slow Roads">
          <div className="eyebrow">
            <span />
            NO DESTINATION. NO HURRY.
          </div>
          <h1>
            A little further.
            <br />
            <span>A little slower.</span>
          </h1>
          <p>
            Find a little space between everything.
            <br />
            An endless road, and all the time in the world.
          </p>
          <div className="start-actions">
            <button type="button" className="primary-button" onClick={() => start()}>
              <span>Start driving</span>
              <ArrowUpRight size={19} />
            </button>
            <button type="button" className="text-button" onClick={() => start(true)}>
              Or, just enjoy the ride <ChevronRight size={14} />
            </button>
          </div>
          <div className="intro-controls">
            <Keyboard size={16} />
            <span>WASD or arrow keys to drive</span>
            <span className="tiny-dot" />
            <span>F for autodrive</span>
          </div>
        </section>
      )}
      {!started && (
        <div className="journey-preview">
          <span className="eyebrow">YOUR ROAD AWAITS</span>
          <button
            type="button"
            className="journey-card"
            onClick={() => {
              setTab('journey')
              setPanel(true)
            }}
          >
            <div className={`landscape-preview ${settings.landscape}`}>
              <span className="mini-mountain" />
              <span className="mini-road" />
            </div>
            <div>
              <span className="journey-title">{landscape.title}</span>
              <span className="journey-subtitle">
                {settings.season} <span>·</span>{' '}
                {settings.daylight === 'day'
                  ? 'Daylight'
                  : settings.daylight === 'sunset'
                    ? 'Golden hour'
                    : 'Night'}
              </span>
            </div>
            <ChevronDown size={16} />
          </button>
          <span className="journey-caption">A different journey, every time.</span>
        </div>
      )}
      {started && (
        <>
          <div className="drive-indicator">
            <span className={state.autodrive ? 'status-dot' : 'tiny-dot'} />
            {state.autodrive
              ? 'TAKING THE SCENIC ROUTE'
              : state.offroad
                ? 'A LITTLE OFF THE BEATEN PATH'
                : 'THE ROAD IS YOURS'}
          </div>
          <section className="telemetry" aria-label="Driving dashboard">
            <div className="speed">
              <span className="speed-value">{speed.toFixed(0).padStart(2, '0')}</span>
              <span className="speed-unit">
                {settings.units === 'km' ? 'km/h' : 'mph'}
                <span className="gear">{state.gear}</span>
              </span>
              <div className="speed-track">
                <span style={{ width: `${Math.min(speed / 2, 100)}%` }} />
              </div>
            </div>
            <div className="drive-toolbar">
              <IconButton label={state.paused ? 'Resume driving' : 'Pause driving'} onClick={pause}>
                {state.paused ? <Play /> : <Pause />}
              </IconButton>
              <span className="toolbar-divider" />
              <button
                type="button"
                className={`auto-button ${state.autodrive ? 'enabled' : ''}`}
                onClick={toggleAuto}
              >
                <Route size={16} />
                <span>
                  Autodrive <b>{state.autodrive ? 'on' : 'off'}</b>
                </span>
                <kbd>F</kbd>
              </button>
              <span className="toolbar-divider" />
              <IconButton label="Change camera" onClick={cycleCamera}>
                <Camera />
              </IconButton>
              <IconButton
                label="Reset car to road"
                onClick={() => {
                  engine.current?.reset()
                  announce('Back on the road.')
                }}
              >
                <RotateCcw />
              </IconButton>
            </div>
            <div className="distance">
              <span className="distance-value">{distance.toFixed(1)}</span>
              <span>{settings.units === 'km' ? 'kilometers' : 'miles'} wandered</span>
            </div>
          </section>
          <div className="touch-controls">
            <div>
              {[
                { label: 'Steer left', key: 'steer' as const, value: 1, icon: ArrowLeft },
                { label: 'Steer right', key: 'steer' as const, value: -1, icon: ArrowRight },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  aria-label={item.label}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId)
                    touch(item.key, item.value)
                  }}
                  onPointerUp={() => touch(item.key, 0)}
                  onPointerCancel={() => touch(item.key, 0)}
                >
                  <item.icon />
                </button>
              ))}
            </div>
            <div>
              {[
                { label: 'Brake', key: 'brake' as const, text: 'BRAKE' },
                { label: 'Accelerate', key: 'throttle' as const, text: 'GO' },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  aria-label={item.label}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId)
                    touch(item.key, 1)
                  }}
                  onPointerUp={() => touch(item.key, 0)}
                  onPointerCancel={() => touch(item.key, 0)}
                >
                  {item.text}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <footer className="bottom-line">
        <span>
          <span className="tiny-dot" />{' '}
          {started ? `${landscape.title} / ${settings.season}` : 'An endless escape. Right here.'}
        </span>
        <button type="button" onClick={() => setHelp(true)}>
          <CircleHelp size={14} /> Controls &amp; a little help
        </button>
      </footer>
      {panel && (
        <aside className="settings-panel" aria-label="Drive settings">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">MAKE IT YOUR OWN</span>
              <h2>Your kind of nowhere.</h2>
            </div>
            <IconButton label="Close settings" onClick={() => setPanel(false)}>
              <X />
            </IconButton>
          </div>
          <div className="panel-tabs" role="tablist" aria-label="Settings categories">
            {(['journey', 'vehicle', 'display'] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={tab === item}
                className={tab === item ? 'selected' : ''}
                onClick={() => setTab(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="panel-content">
            {tab === 'journey' && (
              <>
                <section className="setting-section">
                  <h3>Choose your scenery</h3>
                  <div className="landscape-options">
                    {landscapes.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`landscape-option ${settings.landscape === item.id ? 'selected' : ''}`}
                        onClick={() => update('landscape', item.id)}
                      >
                        <div className={`landscape-preview ${item.id}`}>
                          <item.icon size={25} />
                        </div>
                        <span>
                          <strong>{item.title}</strong>
                          <small>{item.subtitle}</small>
                        </span>
                        {settings.landscape === item.id && <Check size={15} />}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="setting-section">
                  <h3>A change of season</h3>
                  <div className="option-row">
                    {seasons.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={settings.season === item.id ? 'selected' : ''}
                        onClick={() => update('season', item.id)}
                      >
                        <item.icon size={20} />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="setting-section">
                  <h3>Chase the light</h3>
                  <div className="option-row">
                    {daylight.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={settings.daylight === item.id ? 'selected' : ''}
                        onClick={() => update('daylight', item.id)}
                      >
                        <item.icon size={20} />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="setting-section">
                  <h3>A new road</h3>
                  <p>The same feeling, somewhere different.</p>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      update('seed', Math.floor(Math.random() * 99999))
                      engine.current?.reset()
                      announce('A new road, just for you.')
                    }}
                  >
                    <RotateCcw size={15} /> Generate a new journey
                  </button>
                </section>
              </>
            )}
            {tab === 'vehicle' && (
              <>
                <section className="setting-section">
                  <h3>Your travelling companion</h3>
                  <div className="vehicle-options">
                    {vehicles.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={settings.vehicle === item.id ? 'selected' : ''}
                        onClick={() => update('vehicle', item.id)}
                      >
                        <item.icon size={31} />
                        <span>{vehicleNames[item.id]}</span>
                        {settings.vehicle === item.id && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="setting-section">
                  <h3>A little color</h3>
                  <div className="swatches">
                    {colors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Paint ${color}`}
                        aria-pressed={settings.color === color}
                        className={settings.color === color ? 'selected' : ''}
                        style={{ backgroundColor: color }}
                        onClick={() => update('color', color)}
                      >
                        {settings.color === color && <Check size={15} />}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="setting-section">
                  <label className="slider-label" htmlFor="power">
                    Engine power <span>{settings.power.toFixed(1)}×</span>
                  </label>
                  <input
                    id="power"
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={settings.power}
                    onChange={(e) => update('power', Number(e.target.value))}
                  />
                  <label className="slider-label" htmlFor="grip">
                    Tyre grip <span>{settings.grip.toFixed(1)}×</span>
                  </label>
                  <input
                    id="grip"
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={settings.grip}
                    onChange={(e) => update('grip', Number(e.target.value))}
                  />
                  <p>Less grip, a little more adventure.</p>
                </section>
              </>
            )}
            {tab === 'display' && (
              <>
                <section className="setting-section">
                  <h3>A different perspective</h3>
                  <div className="segmented">
                    {cameras.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={settings.camera === item ? 'selected' : ''}
                        onClick={() => update('camera', item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="setting-section">
                  <h3>Scenery detail</h3>
                  <div className="segmented">
                    {(['low', 'high'] as const).map((item) => (
                      <button
                        type="button"
                        key={item}
                        className={settings.quality === item ? 'selected' : ''}
                        onClick={() => update('quality', item)}
                      >
                        {item === 'high' ? 'Full beauty' : 'Easy on the engine'}
                      </button>
                    ))}
                  </div>
                  <p>Lower detail uses less battery and graphics power.</p>
                </section>
                <section className="setting-section">
                  <h3>Measure the journey</h3>
                  <div className="segmented">
                    {(['km', 'mi'] as const).map((item) => (
                      <button
                        type="button"
                        key={item}
                        className={settings.units === item ? 'selected' : ''}
                        onClick={() => update('units', item)}
                      >
                        {item === 'km' ? 'Kilometers' : 'Miles'}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="setting-section">
                  <label className="slider-label" htmlFor="volume">
                    <span>
                      <AudioLines size={15} /> Sounds of the road
                    </span>
                    <span>{Math.round(settings.volume * 100)}%</span>
                  </label>
                  <input
                    id="volume"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={settings.volume}
                    onChange={(e) => update('volume', Number(e.target.value))}
                  />
                </section>
                <section className="setting-section">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      engine.current?.screenshot()
                      announce('A little memory, saved.')
                    }}
                  >
                    <Camera size={16} /> Capture the view
                  </button>
                </section>
              </>
            )}
          </div>
          <div className="panel-footnote">
            <ShieldCheck size={15} />
            <span>
              {offline
                ? 'Your road is saved for offline adventures.'
                : 'No accounts. No finish lines. Just drive.'}
            </span>
          </div>
        </aside>
      )}
      {started && state.paused && (
        <Modal titleId="pause-title" onClose={pause}>
          <section className="dialog pause-dialog" aria-labelledby="pause-title">
            <span className="eyebrow">TAKE YOUR TIME</span>
            <h2 id="pause-title">The road can wait.</h2>
            <p>A quiet moment. We’ll be right here.</p>
            <button type="button" className="primary-button" onClick={pause}>
              <Play size={16} /> Keep wandering
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                pause()
                setPanel(true)
              }}
            >
              Change the scenery <Settings2 size={14} />
            </button>
          </section>
        </Modal>
      )}
      {help && (
        <Modal titleId="help-title" onClose={() => setHelp(false)}>
          <section className="dialog help-dialog" aria-labelledby="help-title">
            <IconButton label="Close help" onClick={() => setHelp(false)}>
              <X />
            </IconButton>
            <span className="eyebrow">A FEW THINGS FOR THE ROAD</span>
            <h2 id="help-title">You’re in no hurry.</h2>
            <p>There’s no score, no traffic, and nowhere you need to be.</p>
            <div className="key-list">
              {[
                ['W / ↑', 'Accelerate'],
                ['S / ↓', 'Brake, then reverse'],
                ['A D / ← →', 'Steer'],
                ['Space', 'Handbrake'],
                ['F', 'Toggle autodrive'],
                ['C', 'Change camera'],
                ['R', 'Return to the road'],
                ['P / Esc', 'Pause the drive'],
              ].map(([key, label]) => (
                <div key={key}>
                  <span>{label}</span>
                  <kbd>{key}</kbd>
                </div>
              ))}
            </div>
            <div className="help-note">
              <ShieldCheck size={19} />
              <p>
                Once the production version says “Offline ready”, this entire world works without
                the internet. Your preferences stay on this device.
              </p>
            </div>
          </section>
        </Modal>
      )}
      {error && (
        <Modal onClose={() => setError('')}>
          <section className="dialog" role="alert">
            <Mountain size={30} />
            <h2>A small detour.</h2>
            <p>{error}</p>
            <button type="button" className="primary-button" onClick={() => location.reload()}>
              Try again
            </button>
          </section>
        </Modal>
      )}
      <div className={`toast ${toast ? 'visible' : ''}`} role="status">
        {toast}
      </div>
    </main>
  )
}
