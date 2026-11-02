import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Camera,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Expand,
  Keyboard,
  Mountain,
  Pause,
  Play,
  RotateCcw,
  Route,
  Settings2,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { Help } from './components/Help'
import { IconButton } from './components/IconButton'
import { Modal } from './components/Modal'
import { landscapes } from './components/options'
import { SettingsPanel } from './components/SettingsPanel'
import { assistanceLabels } from './game/controls'
import { useDrive } from './useDrive'

export function Drive() {
  const {
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
  } = useDrive()
  const speed = Math.abs(state.speed) * (settings.units === 'km' ? 3.6 : 2.23694)
  const distance = state.distance / (settings.units === 'km' ? 1000 : 1609.344)
  const landscape = landscapes.find((x) => x.id === settings.landscape) ?? landscapes[0]
  return (
    <main
      className={`drive ${started ? 'is-driving' : 'is-welcome'} ${panel ? 'panel-open' : ''}`}
      data-controller={state.controller}
      data-landscape={settings.landscape}
      data-season={settings.season}
      data-daylight={settings.daylight}
      data-weather={settings.weather}
      data-vehicle={settings.vehicle}
    >
      <canvas
        ref={canvas}
        aria-label="Interactive 3D scenic driving game. Use W A S D or arrow keys to drive."
      />
      <div className="scene-shade" />
      {started && settings.mouseEnabled && !panel && !help && !state.paused && (
        <div
          className="mouse-steering"
          data-mouse-steer={state.mouseSteering.toFixed(2)}
          aria-hidden="true"
        >
          <div className="mouse-track">
            <i style={{ left: `${50 - state.mouseSteering * 50}%` }} />
          </div>
        </div>
      )}
      <header className="topbar">
        {!started && (
          <>
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
          </>
        )}
        <div className="top-actions">
          {!started && (
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
              {offline ? 'Offline ready' : online ? 'Online' : 'Offline'}
            </span>
          )}
          {started && (
            <IconButton label="Driving controls" onClick={() => setHelp(true)}>
              <CircleHelp />
            </IconButton>
          )}
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
            <button
              type="button"
              className="primary-button"
              disabled={!ready}
              onClick={() => start()}
            >
              <span>{ready ? 'Start driving' : 'Preparing the road...'}</span>
              <ArrowUpRight size={19} />
            </button>
            <button
              type="button"
              className="text-button"
              disabled={!ready}
              onClick={() => start(true)}
            >
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
              <span>{settings.units === 'km' ? 'km' : 'mi'}</span>
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
      {!started && (
        <footer className="bottom-line">
          <span>
            <span className="tiny-dot" /> An endless escape. Right here.
          </span>
          <button type="button" onClick={() => setHelp(true)}>
            <CircleHelp size={14} /> Controls &amp; a little help
          </button>
        </footer>
      )}
      {panel && (
        <SettingsPanel
          settings={settings}
          update={update}
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
