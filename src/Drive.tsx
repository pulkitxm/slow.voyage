import {
  Aperture,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bus,
  Camera,
  Car,
  CarFront,
  CarTaxiFront,
  ChevronRight,
  CircleHelp,
  Expand,
  Motorbike,
  Mountain,
  Pause,
  Play,
  RotateCcw,
  Route,
  Settings2,
  Truck,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { MouseBar, RoadFinder, Speed, Trip, TurnBack } from './components/Dashboard'
import { Help } from './components/Help'
import { IconButton } from './components/IconButton'
import { Modal } from './components/Modal'
import { SettingsPanel } from './components/SettingsPanel'
import { bodyFor } from './game/car-bodies'
import { assistanceLabels } from './game/controls'
import { minimapLayout } from './game/minimap'
import { vehicleNames } from './game/vehicles'
import type { Vehicle } from './game/world'
import { useDrive } from './useDrive'

const loadingCopy: Record<string, string> = {
  stone: 'Shaping the land',
  hills: 'Planting the hills',
  light: 'Setting the light',
}

const vehicleIcons: Record<Vehicle, typeof Car> = {
  touring: Car,
  roadster: CarFront,
  motorcycle: Motorbike,
  bus: Bus,
  pickup: Truck,
  hatchback: CarTaxiFront,
  supercar: Zap,
}

export function Drive() {
  const {
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
    error,
    setError,
    toast,
    announce,
    update,
    apply,
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
  } = useDrive()
  const VehicleIcon = vehicleIcons[settings.vehicle]
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    const release = (event: MouseEvent) => {
      if (event.detail === 0 || !(event.target instanceof Element)) return
      const control = event.target.closest('button, a')
      if (control instanceof HTMLElement && !control.closest('.settings-panel, dialog'))
        control.blur()
    }
    document.addEventListener('click', release)
    return () => document.removeEventListener('click', release)
  }, [])
  useEffect(() => {
    const apply = () => {
      const node = root.current
      if (!node) return
      node.dataset.steering = telemetry.state.steering.toFixed(4)
      node.dataset.boost = String(telemetry.state.boost)
    }
    apply()
    return telemetry.subscribe(apply)
  }, [telemetry])
  const mapUnit = settings.units === 'km' ? 1000 : 1609.344
  return (
    <main
      ref={root}
      className={`drive ${started ? 'is-driving' : 'is-welcome'} ${panel ? 'panel-open' : ''} ${state.photo ? 'is-photo' : ''}`}
      data-controller={state.controller}
      data-landscape={settings.landscape}
      data-season={settings.season}
      data-daylight={settings.daylight}
      data-weather={settings.weather}
      data-vehicle={settings.vehicle}
      data-camera={settings.camera}
    >
      <canvas
        ref={canvas}
        aria-label="Interactive 3D scenic driving game. Use W A S D or arrow keys to drive."
      />
      <div className="scene-shade" />
      {started && settings.mouseEnabled && !panel && !help && !state.paused && (
        <MouseBar store={telemetry} />
      )}
      <header className="topbar">
        <div className="top-actions">
          {!started && offline && (
            <span className="offline-status" title="Ready to play without an internet connection">
              <span className="status-dot" />
              Offline ready
            </span>
          )}
          <IconButton label="Driving controls" onClick={() => setHelp(true)}>
            <CircleHelp />
          </IconButton>
          <IconButton label={settings.volume ? 'Mute sound' : 'Unmute sound'} onClick={toggleMute}>
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
        <>
          <div className={`welcome-sky ${ready ? 'is-ready' : ''}`} aria-hidden="true">
            <span className="welcome-glow" />
            <span className="welcome-cloud" />
            <span className="welcome-land" />
          </div>
          <section
            className={`intro ${ready ? 'is-ready' : 'is-loading'}`}
            aria-label="Welcome to slow.voyage"
          >
            <h1 className="wordmark">slow.voyage</h1>
            <p>An endless road with no destination. Drive it, or sit back and watch.</p>
            <div className="start-actions">
              <button
                type="button"
                className="primary-button"
                disabled={!ready}
                aria-busy={!ready}
                onClick={() => start()}
              >
                {!ready && (
                  <span
                    className="button-fill"
                    style={{ transform: `scaleX(${Math.max(0.04, loading.fraction)})` }}
                  />
                )}
                <span>
                  {ready
                    ? 'Start driving'
                    : `${loadingCopy[loading.stage] ?? loadingCopy.stone} ${Math.round(loading.fraction * 100)}%`}
                </span>
                {ready && <ArrowUpRight size={18} />}
              </button>
              <button
                type="button"
                className="text-button"
                disabled={!ready}
                onClick={() => start(true)}
              >
                Autodrive <ChevronRight size={15} />
              </button>
            </div>
            {!ready && (
              <div
                className="visually-hidden"
                role="progressbar"
                aria-label="Preparing the world"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(loading.fraction * 100)}
              />
            )}
            <p className="intro-hint">WASD or arrow keys to drive · F for autodrive</p>
          </section>
        </>
      )}
      {started && (
        <>
          <aside className="minimap" aria-label="Map of the road around you">
            <canvas ref={minimap} />
            <div className="minimap-caption">
              <span>
                NEXT {(minimapLayout.range / mapUnit).toFixed(1)} {settings.units}
              </span>
              {state.found > 0 && <span>FOUND {state.found}</span>}
            </div>
            <RoadFinder store={telemetry} units={settings.units} />
          </aside>
          <TurnBack store={telemetry} units={settings.units} />
          <section className="telemetry" aria-label="Driving dashboard">
            <Speed
              store={telemetry}
              units={settings.units}
              manual={settings.transmission === 'manual'}
              quiet={state.paused || panel || help}
              onNeutral={() => engine.current?.toggleNeutral()}
            />
            <div className="drive-toolbar">
              <IconButton label={state.paused ? 'Resume driving' : 'Pause driving'} onClick={pause}>
                {state.paused ? <Play /> : <Pause />}
              </IconButton>
              <span className="toolbar-divider" />
              <button
                type="button"
                className={`auto-button ${state.assistance !== 'off' ? 'enabled' : ''}`}
                data-assistance={state.assistance}
                onClick={toggleAuto}
              >
                <Route size={16} />
                <span>
                  {
                    assistanceLabels[
                      state.assistance === 'off' ? settings.autodriveMode : state.assistance
                    ]
                  }{' '}
                  <b>{state.assistance !== 'off' ? 'on' : 'off'}</b>
                </span>
                <kbd>F</kbd>
              </button>
              <span className="toolbar-divider" />
              <IconButton label={`Change camera (${settings.camera})`} onClick={cycleCamera}>
                <Camera />
              </IconButton>
              <IconButton label="Photo mode" onClick={togglePhoto}>
                <Aperture />
              </IconButton>
              <IconButton
                label={`Switch vehicle (${bodyFor(settings)?.name ?? vehicleNames[settings.vehicle]})`}
                onClick={() => cycleVehicle(1)}
              >
                <VehicleIcon />
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
            <Trip store={telemetry} units={settings.units} lifetime={lifetime} />
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
                  onLostPointerCapture={() => touch(item.key, 0)}
                >
                  <item.icon />
                </button>
              ))}
            </div>
            <div>
              {[
                { label: 'Brake', key: 'brake' as const, text: 'BRAKE' },
                { label: 'Accelerate', key: 'throttle' as const, text: 'GO' },
                { label: 'Boost', key: 'boost' as const, text: 'BOOST' },
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
                  onLostPointerCapture={() => touch(item.key, 0)}
                >
                  {item.text}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {panel && (
        <SettingsPanel
          settings={settings}
          update={update}
          apply={apply}
          tab={tab}
          setTab={setTab}
          offline={offline}
          controller={state.controller}
          onClose={() => setPanel(false)}
          onNewJourney={() => {
            update('seed', Math.floor(Math.random() * 99999))
            engine.current?.reset()
            announce('A new road, just for you.')
          }}
          onShare={copyLink}
          onCapture={() => {
            engine.current?.screenshot()
            announce('A little memory, saved.')
          }}
        />
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
      {state.photo && (
        <div className="photo-hint" role="status">
          <span>Drag to look around</span>
          <span>Scroll to zoom</span>
          <span>
            <kbd>Enter</kbd> saves
          </span>
          <button type="button" onClick={togglePhoto}>
            <kbd>Esc</kbd> back to the road
          </button>
        </div>
      )}
      {help && <Help onClose={() => setHelp(false)} />}
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
