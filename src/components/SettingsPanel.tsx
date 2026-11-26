import { AudioLines, Camera, Check, Link2, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { useEffect } from 'react'
import { assistanceLabels } from '../game/controls'
import { cruiseLimits } from '../game/cruise'
import type { ControllerStatus } from '../game/gamepad'
import { type SupercarModel, supercarModels, supercarTrims } from '../game/supercars'
import { vehicleNames } from '../game/vehicles'
import type { Settings } from '../game/world'
import { ControllerMapping } from './ControllerMapping'
import { IconButton } from './IconButton'
import {
  cameras,
  colors,
  daylight,
  landscapes,
  life,
  qualities,
  roadModes,
  roadWear,
  seasons,
  steeringAssists,
  vehicles,
  weather,
} from './options'

const silhouettes: Record<
  SupercarModel,
  { body: string; wheels: [number, number]; extra?: string }
> = {
  classic: { body: 'M6 27 L9 20 L40 16 L58 9 L78 9 L100 17 L114 20 L116 27 Z', wheels: [28, 94] },
  grand: { body: 'M5 27 L7 19 L30 16 L44 9 L64 8 L76 15 L111 18 L116 27 Z', wheels: [26, 94] },
  longtail: { body: 'M2 26 L5 21 L36 18 L54 10 L70 9 L86 14 L111 20 L115 26 Z', wheels: [34, 95] },
  track: {
    body: 'M7 27 L9 19 L40 16 L58 9 L77 9 L99 17 L114 21 L117 27 Z',
    wheels: [28, 95],
    extra: 'M6 8 L26 8 L26 10.5 L6 10.5 Z M15 10 L17 10 L19 17 L17 17 Z',
  },
}

function Silhouette({ model }: { model: SupercarModel }) {
  const shape = silhouettes[model]
  return (
    <svg viewBox="0 0 120 34" width="96" height="27" aria-hidden="true">
      <path d={shape.body} fill="currentColor" opacity="0.85" />
      {shape.extra && <path d={shape.extra} fill="currentColor" opacity="0.85" />}
      {shape.wheels.map((x) => (
        <circle
          key={x}
          cx={x}
          cy="27"
          r="6"
          fill="currentColor"
          stroke="#f5f5eb"
          strokeWidth="1.6"
        />
      ))}
    </svg>
  )
}

export type SettingsTab = 'journey' | 'vehicle' | 'controls' | 'display'
interface Props {
  settings: Settings
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  tab: SettingsTab
  setTab: (tab: Props['tab']) => void
  offline: boolean
  controller: ControllerStatus
  onClose: () => void
  onNewJourney: () => void
  onShare: () => void
  onCapture: () => void
}
export function SettingsPanel({
  settings,
  update,
  tab,
  setTab,
  offline,
  controller,
  onClose,
  onNewJourney,
  onShare,
  onCapture,
}: Props) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat || event.defaultPrevented) return
      if (document.querySelector('dialog[open]')) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])
  const cruiseFactor = settings.units === 'km' ? 3.6 : 2.23694
  const cruiseReverse = settings.cruiseSpeed < 0
  return (
    <aside className="settings-panel" aria-label="Drive settings">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">MAKE IT YOUR OWN</span>
          <h2>Your kind of nowhere.</h2>
        </div>
        <IconButton label="Close settings" onClick={onClose}>
          <X />
        </IconButton>
      </div>
      <div className="panel-tabs" role="tablist" aria-label="Settings categories">
        {(['journey', 'vehicle', 'controls', 'display'] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-controls="settings-content"
            aria-selected={tab === item}
            className={tab === item ? 'selected' : ''}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div
        key={tab}
        className="panel-content"
        id="settings-content"
        role="tabpanel"
        aria-label={`${tab} settings`}
      >
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
              <h3>The road</h3>
              <div className="segmented">
                {roadModes.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={settings.roadMode === item.id ? 'selected' : ''}
                    aria-pressed={settings.roadMode === item.id}
                    onClick={() => update('roadMode', item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p>{roadModes.find((item) => item.id === settings.roadMode)?.description}</p>
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
              <h3>Weather</h3>
              <div className="option-row weather-options">
                {weather.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={settings.weather === item.id ? 'selected' : ''}
                    aria-pressed={settings.weather === item.id}
                    onClick={() => update('weather', item.id)}
                  >
                    <item.icon size={20} />
                    <span>
                      {item.id === 'rain' && settings.season === 'winter' ? 'Snow' : item.label}
                    </span>
                  </button>
                ))}
              </div>
              <p>Q and E cycle scenery and weather. V changes your vehicle.</p>
            </section>
            <section className="setting-section">
              <h3>Roadside life</h3>
              <div className="segmented">
                {life.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={settings.life === item.id ? 'selected' : ''}
                    aria-pressed={settings.life === item.id}
                    onClick={() => update('life', item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p>
                Walkers on the verge and herds grazing in the fields. They run from the horn and
                from a car heading their way, and fall if it reaches them.
              </p>
              <label className="check-option">
                <input
                  type="checkbox"
                  checked={settings.blood}
                  onChange={(event) => update('blood', event.target.checked)}
                />
                Show blood
              </label>
            </section>
            <section className="setting-section">
              <h3>Road surface</h3>
              <div className="segmented">
                {roadWear.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={settings.roadWear === item.id ? 'selected' : ''}
                    aria-pressed={settings.roadWear === item.id}
                    onClick={() => update('roadWear', item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p>Dirt, repairs and puddles gather on older roads. Potholes jolt the suspension.</p>
            </section>
            <section className="setting-section">
              <h3>A new road</h3>
              <p>The same feeling, somewhere different.</p>
              <button type="button" className="secondary-button" onClick={onNewJourney}>
                <RotateCcw size={15} /> Generate a new journey
              </button>
              <button type="button" className="secondary-button" onClick={onShare}>
                <Link2 size={15} /> Copy a link to this spot
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
            {settings.vehicle === 'supercar' && (
              <section className="setting-section">
                <h3>Choose your supercar</h3>
                <div className="supercar-options">
                  {supercarModels.map((model) => (
                    <button
                      type="button"
                      key={model}
                      className={settings.supercarModel === model ? 'selected' : ''}
                      aria-pressed={settings.supercarModel === model}
                      onClick={() => update('supercarModel', model)}
                    >
                      <Silhouette model={model} />
                      <span>
                        <strong>{supercarTrims[model].name}</strong>
                        <small>{supercarTrims[model].engine}</small>
                      </span>
                      {settings.supercarModel === model && <Check size={14} />}
                    </button>
                  ))}
                </div>
                <p>{supercarTrims[settings.supercarModel].tagline}</p>
              </section>
            )}
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
                min="0.2"
                max="2"
                step="0.1"
                value={settings.grip}
                onChange={(e) => update('grip', Number(e.target.value))}
              />
              <p>Less grip, a little more adventure.</p>
            </section>
          </>
        )}
        {tab === 'controls' && (
          <>
            <section className="setting-section">
              <h3>Driving assistance</h3>
              <div className="segmented">
                {(['full', 'steer', 'speed'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={settings.autodriveMode === mode}
                    className={settings.autodriveMode === mode ? 'selected' : ''}
                    onClick={() => update('autodriveMode', mode)}
                  >
                    {assistanceLabels[mode]}
                  </button>
                ))}
              </div>
              <p>
                Autodrive handles both. Autosteer follows the road while you use the pedals.
                Autospeed holds your speed while you steer.
              </p>
            </section>
            <section className="setting-section">
              <h3>Cruise direction</h3>
              <div className="segmented">
                <button
                  type="button"
                  aria-pressed={settings.cruiseSpeed > 0}
                  className={settings.cruiseSpeed > 0 ? 'selected' : ''}
                  onClick={() => update('cruiseSpeed', Math.max(1, Math.abs(settings.cruiseSpeed)))}
                >
                  Forward
                </button>
                <button
                  type="button"
                  aria-pressed={settings.cruiseSpeed === 0}
                  className={settings.cruiseSpeed === 0 ? 'selected' : ''}
                  onClick={() => update('cruiseSpeed', 0)}
                >
                  Stop
                </button>
                <button
                  type="button"
                  aria-pressed={cruiseReverse}
                  className={cruiseReverse ? 'selected' : ''}
                  onClick={() =>
                    update(
                      'cruiseSpeed',
                      -Math.min(cruiseLimits.reverse, Math.max(1, Math.abs(settings.cruiseSpeed))),
                    )
                  }
                >
                  Reverse
                </button>
              </div>
              <p>Choose a direction, or Stop to hold the vehicle with its brakes.</p>
              <label className="slider-label" htmlFor="cruise-speed">
                Cruise speed{' '}
                <span>
                  {cruiseReverse ? 'R · ' : ''}
                  {Math.round(Math.abs(settings.cruiseSpeed) * cruiseFactor)}{' '}
                  {settings.units === 'km' ? 'km/h' : 'mph'}
                </span>
              </label>
              <input
                id="cruise-speed"
                type="range"
                min="1"
                max={Math.floor(
                  (cruiseReverse ? cruiseLimits.reverse : cruiseLimits.forward) * cruiseFactor,
                )}
                step="1"
                disabled={settings.cruiseSpeed === 0}
                value={Math.max(1, Math.round(Math.abs(settings.cruiseSpeed) * cruiseFactor))}
                onChange={(event) =>
                  update(
                    'cruiseSpeed',
                    ((cruiseReverse ? -1 : 1) * Number(event.target.value)) / cruiseFactor,
                  )
                }
              />
              <p>Use + and - while driving. Decrease through Stop to select reverse.</p>
            </section>
            <section className="setting-section">
              <h3>Gearbox</h3>
              <div className="segmented">
                {(['automatic', 'manual'] as const).map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={settings.transmission === item ? 'selected' : ''}
                    aria-pressed={settings.transmission === item}
                    onClick={() => update('transmission', item)}
                  >
                    {item === 'automatic' ? 'Automatic' : 'Manual'}
                  </button>
                ))}
              </div>
              <p>
                Manual puts the gears on E (up) and Q (down), or the scenery buttons on a
                controller. Each gear pulls hardest in the upper half of its revs and stops at the
                limiter, a gear too tall for the speed lugs and shudders, and lifting off slows the
                car on the engine. Off the throttle you can shift freely. Holding the brake through
                a stop drops into reverse. Autodrive shifts for you.
              </p>
            </section>
            <section className="setting-section">
              <h3>Steering</h3>
              <div className="segmented">
                {steeringAssists.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={settings.steeringAssist === item.id ? 'selected' : ''}
                    aria-pressed={settings.steeringAssist === item.id}
                    onClick={() => update('steeringAssist', item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p>
                {steeringAssists.find((item) => item.id === settings.steeringAssist)?.description}
              </p>
            </section>
            <section className="setting-section">
              <label className="check-option">
                <input
                  type="checkbox"
                  checked={settings.onePedal}
                  onChange={(event) => update('onePedal', event.target.checked)}
                />
                One-pedal driving
              </label>
              <p>
                Gently brake when you release the accelerator. Use S or the brake pedal to reverse.
              </p>
            </section>
          </>
        )}
        {tab === 'controls' && (
          <section className="setting-section">
            <label className="check-option">
              <input
                type="checkbox"
                checked={settings.controllerEnabled}
                onChange={(event) => update('controllerEnabled', event.target.checked)}
              />
              Enable controller
            </label>
            <p role="status">
              {!settings.controllerEnabled
                ? 'Controller input is off.'
                : controller === 'connected'
                  ? settings.controllerMode === 'custom'
                    ? 'Custom bindings active. Release controls after changes.'
                    : 'Controller connected. Left stick steers; triggers accelerate and brake.'
                  : controller === 'unsupported'
                    ? settings.controllerMode === 'custom'
                      ? 'Bind controls below to use this device.'
                      : 'Choose Custom below to bind this device.'
                    : controller === 'unavailable'
                      ? 'Controller access is unavailable in this browser.'
                      : 'Connect a controller and press one of its buttons.'}
            </p>
            <label className="slider-label" htmlFor="controller-deadzone">
              Stick deadzone <span>{Math.round(settings.controllerDeadzone * 100)}%</span>
            </label>
            <input
              id="controller-deadzone"
              type="range"
              min="5"
              max="40"
              step="1"
              value={Math.round(settings.controllerDeadzone * 100)}
              onChange={(event) => update('controllerDeadzone', Number(event.target.value) / 100)}
            />
            <p>Increase the deadzone if your stick drifts when released.</p>
            <ControllerMapping
              mode={settings.controllerMode}
              bindings={settings.controllerBindings}
              onMode={(mode) => update('controllerMode', mode)}
              onBindings={(bindings) => update('controllerBindings', bindings)}
            />
          </section>
        )}
        {tab === 'controls' && (
          <section className="setting-section">
            <label className="check-option">
              <input
                type="checkbox"
                checked={settings.mouseEnabled}
                onChange={(event) => update('mouseEnabled', event.target.checked)}
              />
              Mouse driving
            </label>
            <p>
              Move left or right to steer. Hold left click to accelerate; right click to brake and
              reverse. Press M to toggle.
            </p>
            <label className="slider-label" htmlFor="mouse-sensitivity">
              Mouse sensitivity <span>{settings.mouseSensitivity.toFixed(1)}×</span>
            </label>
            <input
              id="mouse-sensitivity"
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={settings.mouseSensitivity}
              onChange={(event) => update('mouseSensitivity', Number(event.target.value))}
            />
            <p>Mouse driving takes priority over controller pedals and steering.</p>
          </section>
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
              <h3>Camera motion</h3>
              <div className="segmented">
                {(['full', 'calm'] as const).map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={settings.motion === item ? 'selected' : ''}
                    aria-pressed={settings.motion === item}
                    onClick={() => update('motion', item)}
                  >
                    {item === 'full' ? 'Feel the road' : 'Keep it steady'}
                  </button>
                ))}
              </div>
              <p>
                The view leans into bends, dips under braking and trembles at speed. Steady turns
                that off, along with speed blur and drops on the lens.
              </p>
            </section>
            <section className="setting-section">
              <h3>Scenery detail</h3>
              <div className="segmented">
                {qualities.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={settings.quality === item.id ? 'selected' : ''}
                    aria-pressed={settings.quality === item.id}
                    onClick={() => update('quality', item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p>
                Lower detail uses less battery and graphics power. Ultra adds richer light and
                shade, and steps back by itself if the drive stops being smooth.
              </p>
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
              <button type="button" className="secondary-button" onClick={onCapture}>
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
  )
}
