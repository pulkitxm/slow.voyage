import { AudioLines, Camera, Check, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { vehicleNames } from '../game/vehicles'
import type { Settings } from '../game/world'
import { IconButton } from './IconButton'
import { cameras, colors, daylight, landscapes, seasons, vehicles } from './options'

interface Props {
  settings: Settings
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  tab: 'journey' | 'vehicle' | 'display'
  setTab: (tab: Props['tab']) => void
  offline: boolean
  onClose: () => void
  onNewJourney: () => void
  onCapture: () => void
}
export function SettingsPanel({
  settings,
  update,
  tab,
  setTab,
  offline,
  onClose,
  onNewJourney,
  onCapture,
}: Props) {
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
        {(['journey', 'vehicle', 'display'] as const).map((item) => (
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
              <button type="button" className="secondary-button" onClick={onNewJourney}>
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
