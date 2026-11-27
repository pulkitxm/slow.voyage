import {
  AudioLines,
  Camera,
  Check,
  ChevronDown,
  Link2,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { brakeSpecs } from '../game/brakes'
import { bodyFor, bodyNamed } from '../game/car-bodies'
import { assistanceLabels } from '../game/controls'
import { cruiseLimits } from '../game/cruise'
import {
  carName,
  type EngineFamily,
  engineCars,
  engineFamilies,
  type SwapEngine,
} from '../game/engine-catalog'
import { engineSounds } from '../game/engine-sound'
import {
  engineCatalog,
  fitCar,
  horsepower,
  stockPower,
  swapEngines,
  swappable,
} from '../game/engines'
import type { ControllerStatus } from '../game/gamepad'
import { vehicleNames } from '../game/vehicles'
import type { EngineId, Settings, Vehicle } from '../game/world'
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

export type SettingsTab = 'journey' | 'vehicle' | 'controls' | 'display'
interface Props {
  settings: Settings
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  apply: (changes: Partial<Settings>) => void
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
  apply,
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
            <CarChoice settings={settings} apply={apply} />
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

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

interface Choice {
  key: string
  title: string
  badge?: string
  detail?: string
  note?: string
  search: string
}
interface ChoiceGroup {
  label: string
  choices: Choice[]
}

function Dropdown({
  label,
  groups,
  selected,
  onSelect,
  disabled = false,
  placeholder,
}: {
  label: string
  groups: ChoiceGroup[]
  selected: string | null
  onSelect: (key: string) => void
  disabled?: boolean
  placeholder: string
}) {
  const id = useId()
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState('')
  const holder = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const total = groups.reduce((sum, group) => sum + group.choices.length, 0)
  const searchable = total > 8
  const close = (refocus = true) => {
    setExpanded(false)
    setQuery('')
    if (refocus) trigger.current?.focus()
  }
  const closer = useRef(close)
  closer.current = close
  useEffect(() => {
    if (!expanded) return
    const frame = requestAnimationFrame(() => {
      holder.current?.scrollIntoView({ block: 'nearest' })
      const list = menu.current
      const picked = list?.querySelector<HTMLElement>('.engine-option.selected')
      if (list && picked) {
        const offset = picked.getBoundingClientRect().top - list.getBoundingClientRect().top
        list.scrollTop += offset - (list.clientHeight - picked.offsetHeight) / 2
      }
      if (search.current && matchMedia('(pointer: fine)').matches) search.current.focus()
      else (picked ?? list?.querySelector<HTMLElement>('.engine-option'))?.focus()
    })
    const options = () =>
      Array.from(menu.current?.querySelectorAll<HTMLElement>('.engine-option') ?? [])
    const away = (event: Event) => {
      if (holder.current && !holder.current.contains(event.target as Node)) closer.current(false)
    }
    const keys = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !holder.current) return
      const focused = document.activeElement
      if (event.key === 'Escape') {
        event.preventDefault()
        if (search.current?.value) setQuery('')
        else closer.current()
        return
      }
      if (!holder.current.contains(focused)) return
      const list = options()
      const at = list.indexOf(focused as HTMLElement)
      const move = (index: number) => {
        event.preventDefault()
        list[Math.max(0, Math.min(list.length - 1, index))]?.focus()
      }
      if (event.key === 'ArrowDown') {
        if (at < 0) {
          const picked = list.findIndex((item) => item.classList.contains('selected'))
          move(search.current?.value || picked < 0 ? 0 : picked)
        } else move(at + 1)
      } else if (event.key === 'ArrowUp') {
        if (at === 0 && search.current) {
          event.preventDefault()
          search.current.focus()
        } else if (at > 0) move(at - 1)
      } else if (event.key === 'Home' && at >= 0) move(0)
      else if (event.key === 'End' && at >= 0) move(list.length - 1)
      else if (
        at >= 0 &&
        search.current &&
        event.key.length === 1 &&
        event.key !== ' ' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      )
        search.current.focus()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('focusin', away)
    document.addEventListener('keydown', keys, true)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('focusin', away)
      document.removeEventListener('keydown', keys, true)
    }
  }, [expanded])
  useEffect(() => {
    if (menu.current && query) menu.current.scrollTop = 0
  }, [query])
  const every = groups.flatMap((group) => group.choices)
  const current = every.find((choice) => choice.key === selected) ?? null
  const words = plain(query).split(/\s+/).filter(Boolean)
  const shown = groups
    .map((group) => ({
      ...group,
      choices: group.choices.filter((choice) =>
        words.every((word) => choice.search.includes(word)),
      ),
    }))
    .filter((group) => group.choices.length)
  const found = shown.reduce((sum, group) => sum + group.choices.length, 0)
  const choose = (key: string) => {
    onSelect(key)
    close()
  }
  const face = (choice: Choice) => (
    <>
      {choice.badge && <span className="engine-badge">{choice.badge}</span>}
      <span>
        <strong>{choice.title}</strong>
        {choice.detail && <small>{choice.detail}</small>}
        {choice.note && <small className="engine-note">{choice.note}</small>}
      </span>
    </>
  )
  return (
    <div className="engine-dropdown" ref={holder}>
      <span className="engine-label" id={`${id}-label`}>
        {label}
      </span>
      <button
        type="button"
        ref={trigger}
        className="landscape-option engine-option engine-current"
        aria-expanded={expanded}
        aria-controls={`${id}-menu`}
        aria-labelledby={`${id}-label ${id}-value`}
        disabled={disabled || total === 0}
        onClick={() => (expanded ? close() : setExpanded(true))}
      >
        <span id={`${id}-value`} className="engine-face">
          {current ? face(current) : <span className="engine-placeholder">{placeholder}</span>}
        </span>
        <ChevronDown size={16} className={expanded ? 'engine-chevron open' : 'engine-chevron'} />
      </button>
      {expanded && (
        <div className="engine-popover" id={`${id}-menu`}>
          {searchable && (
            <label className="engine-search">
              <Search size={14} />
              <input
                ref={search}
                type="search"
                value={query}
                placeholder={`Search ${label.toLowerCase()}s`}
                aria-label={`Search ${label.toLowerCase()}s`}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  const first = menu.current?.querySelector<HTMLElement>('.engine-option')
                  if (!first) return
                  event.preventDefault()
                  first.click()
                }}
              />
              <span className="engine-count" aria-live="polite">
                {found} {found === 1 ? 'match' : 'matches'}
              </span>
            </label>
          )}
          <div className="engine-menu" ref={menu}>
            {shown.map((group) => (
              <div key={group.label} className="engine-family">
                {group.label && <h4>{group.label}</h4>}
                {group.choices.map((choice) => (
                  <button
                    type="button"
                    key={choice.key}
                    aria-pressed={choice.key === selected}
                    className={`landscape-option engine-option ${choice.key === selected ? 'selected' : ''}`}
                    onClick={() => choose(choice.key)}
                  >
                    {face(choice)}
                    {choice.key === selected && <Check size={15} />}
                  </button>
                ))}
              </div>
            ))}
            {!found && <p className="engine-empty">Nothing matches "{query}".</p>}
          </div>
        </div>
      )}
    </div>
  )
}

const ownEngine = 'own'
const classKey = (vehicle: Vehicle) => `class:${vehicle}`

export const vehicleBlurbs: Record<Vehicle, string> = {
  touring: 'A comfortable classic coupe',
  roadster: 'Open top, two seats, light on its feet',
  hatchback: 'Small, nimble and easy to drive',
  supercar: 'Low, wide and very fast',
  pickup: 'Rides high and shrugs off rough ground',
  motorcycle: 'Two wheels, leans into every bend',
  bus: 'Big, slow and relaxed',
}

function CarChoice({ settings, apply }: Pick<Props, 'settings' | 'apply'>) {
  const vehicle = settings.vehicle
  const body = bodyFor(settings)
  const chosenCar = body ? engineCars.find((car) => car.name === body.name) : undefined
  const swaps = swappable(vehicle)
  const native: EngineId = chosenCar ? chosenCar.id : 'stock'
  const engine = swaps ? settings.engine : 'stock'
  const power = (id: EngineId) =>
    id === 'stock' ? horsepower(stockPower[vehicle]) : horsepower(engineCatalog[id].power)
  const makers = [...new Set(engineCars.map((car) => car.maker))].sort((a, b) => a.localeCompare(b))
  const carGroups: ChoiceGroup[] = [
    {
      label: 'Easy picks',
      choices: vehicles.map((item) => ({
        key: classKey(item.id),
        title: vehicleNames[item.id],
        detail: vehicleBlurbs[item.id],
        search: plain(`${vehicleNames[item.id]} ${vehicleBlurbs[item.id]}`),
      })),
    },
    ...makers.map((maker) => ({
      label: maker,
      choices: engineCars
        .filter((car) => car.maker === maker)
        .map((car) => ({
          key: car.name,
          title: car.model,
          detail: `${horsepower(engineCatalog[car.id].power)} hp`,
          search: plain(`${car.name} ${engineCatalog[car.id].name}`),
        })),
    })),
  ]
  const pickCar = (key: string) => {
    const plainVehicle = vehicles.find((item) => classKey(item.id) === key)
    if (plainVehicle) return apply({ vehicle: plainVehicle.id, engine: 'stock', engineCar: '' })
    const car = engineCars.find((each) => each.name === key)
    const chosen = car && bodyNamed(car.name)
    if (!car || !chosen) return
    apply({
      vehicle: chosen.chassis,
      engine: car.id,
      engineCar: car.name,
      engineView: 'car',
      ...(chosen.paint ? { color: chosen.paint } : {}),
    })
  }
  const engineGroups: ChoiceGroup[] = [
    {
      label: '',
      choices: [
        {
          key: ownEngine,
          title: 'Its own engine',
          detail: chosenCar
            ? `${engineCatalog[chosenCar.id].name} · ${power(chosenCar.id)} hp`
            : `${engineSounds[vehicle].layout} · ${power('stock')} hp`,
          search: 'own original stock',
        },
      ],
    },
    ...(Object.keys(engineFamilies) as EngineFamily[]).map((family) => ({
      label: engineFamilies[family],
      choices: swapEngines
        .filter((id) => engineCatalog[id].family === family && id !== native)
        .map((id) => ({
          key: id,
          title: engineCatalog[id].name,
          detail: `${power(id)} hp`,
          search: plain(
            `${engineCatalog[id].name} ${engineCatalog[id].layout} ${engineCatalog[id].cars.map(carName).join(' ')}`,
          ),
        })),
    })),
  ]
  const pickEngine = (key: string) =>
    apply({ engine: key === ownEngine ? native : (key as EngineId) })
  const shownName = body?.name ?? vehicleNames[vehicle]
  const swapped = swaps && engine !== native
  const fitted = fitCar(settings)
  const speedUnit = settings.units === 'mi' ? 2.23694 : 3.6
  const figures = `Tops out near ${Math.round(fitted.metrics.maxSpeed * speedUnit)} ${settings.units === 'mi' ? 'mph' : 'km/h'} · ${brakeSpecs[fitted.brakes].name.toLowerCase()}.`
  return (
    <section className="setting-section">
      <h3>Your car</h3>
      <div className="engine-pickers">
        <Dropdown
          label="Car"
          groups={carGroups}
          selected={body ? body.name : classKey(vehicle)}
          placeholder="Choose a car"
          onSelect={pickCar}
        />
        <Dropdown
          label="Engine"
          groups={engineGroups}
          selected={swapped ? engine : ownEngine}
          disabled={!swaps}
          placeholder="Its own engine"
          onSelect={pickEngine}
        />
      </div>
      <p>
        {!swaps
          ? 'The motorcycle keeps its own engine.'
          : swapped
            ? `${shownName} with a ${engineCatalog[engine as SwapEngine].name} swapped in. ${engineCatalog[engine as SwapEngine].feel}`
            : body
              ? `The ${body.name}, as it left the factory.`
              : `${vehicleBlurbs[vehicle]}. Pick a real car from the list to drive it instead.`}{' '}
        {figures} Press Z for neutral to rev it in place.
      </p>
    </section>
  )
}
