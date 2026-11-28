import { Check, Droplets, FastForward, LogOut, PaintBucket, Wind, Wrench } from 'lucide-react'
import { useState } from 'react'
import type { GarageJob, GarageStatus } from '../game/garage-session'
import {
  type Exhaust,
  exhaustNames,
  exhausts,
  paintSwatches,
  type RimFinish,
  rimFinishes,
  rimFinishLooks,
  rimFinishNames,
  type WheelStyle,
  wheelStyleNames,
  wheelStyles,
} from '../game/styling'
import { restyles } from '../game/wheel-styling'
import type { Settings } from '../game/world'

interface Props {
  settings: Settings
  status: GarageStatus
  grime: number
  onJob: (job: GarageJob) => void
  onLeave: () => void
  onSkip: () => void
}

export function grimeLabel(level: number) {
  if (level < 0.06) return 'Showroom clean'
  if (level < 0.25) return 'A little dusty'
  if (level < 0.5) return 'Road grime'
  if (level < 0.75) return 'Properly dirty'
  return 'Caked in mud'
}

const spokeCounts: Record<Exclude<WheelStyle, 'factory'>, number> = {
  blade: 10,
  mesh: 20,
  turbine: 16,
  monoblock: 7,
}

function WheelGlyph({ style, finish }: { style: WheelStyle; finish: RimFinish }) {
  const tone = rimFinishLooks[finish].color
  const spokes =
    style === 'factory'
      ? []
      : Array.from({ length: spokeCounts[style] }, (_, index) => {
          const angle = (index / spokeCounts[style]) * Math.PI * 2
          const bend = style === 'turbine' ? 0.6 : style === 'mesh' ? (index % 2 ? 0.25 : -0.25) : 0
          const inner = 5
          const outer = 14
          return {
            x1: 20 + Math.cos(angle) * inner,
            y1: 20 + Math.sin(angle) * inner,
            x2: 20 + Math.cos(angle + bend) * outer,
            y2: 20 + Math.sin(angle + bend) * outer,
          }
        })
  return (
    <svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true">
      <circle cx="20" cy="20" r="18.5" fill="#1d1f1f" />
      <circle cx="20" cy="20" r="14.5" fill="#2b2f31" stroke={tone} strokeWidth="1.6" />
      {style === 'factory' ? (
        <text x="20" y="23.5" textAnchor="middle" fontSize="9" fill={tone}>
          OEM
        </text>
      ) : (
        spokes.map((spoke) => (
          <line
            key={`${spoke.x1}-${spoke.y1}-${spoke.x2}`}
            {...spoke}
            stroke={tone}
            strokeWidth={style === 'monoblock' ? 4.2 : style === 'blade' ? 1.8 : 1.3}
            strokeLinecap="round"
          />
        ))
      )}
      <circle cx="20" cy="20" r="4" fill={tone} />
    </svg>
  )
}

export function GaragePanel({ settings, status, grime, onJob, onLeave, onSkip }: Props) {
  const [paint, setPaint] = useState(settings.color)
  const [style, setStyle] = useState<WheelStyle>(settings.wheelStyle)
  const [finish, setFinish] = useState<RimFinish>(settings.rimFinish)
  const [exhaust, setExhaust] = useState<Exhaust>(settings.exhaust)
  const busy = status.phase !== 'ready'
  const wheelsAllowed = restyles(settings.vehicle)
  const heading =
    status.phase === 'entering'
      ? 'Pulling into the bay'
      : status.phase === 'leaving'
        ? 'Back to the road'
        : status.phase === 'working'
          ? `${status.step}...`
          : 'What can we do for you?'
  return (
    <aside className="settings-panel garage-panel" aria-label="Roadside garage">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">ROADSIDE GARAGE</span>
          <h2>{heading}</h2>
        </div>
      </div>
      <div className="garage-progress" aria-hidden={status.phase !== 'working'}>
        <span
          style={{
            width: `${Math.round((status.phase === 'working' ? status.progress : 0) * 100)}%`,
          }}
        />
      </div>
      <div className="panel-content">
        <section className="setting-section">
          <h3>
            <Droplets size={13} /> Wash and rinse
          </h3>
          <div className="grime-meter" aria-hidden="true">
            <span style={{ width: `${Math.round(grime * 100)}%` }} />
          </div>
          <p>
            {grimeLabel(grime)}. Dirt builds up as you drive, faster in the rain, off the tarmac and
            through water.
          </p>
          <button
            type="button"
            className="garage-action"
            disabled={busy}
            onClick={() => onJob({ kind: 'wash' })}
          >
            Foam, scrub and rinse
          </button>
        </section>
        <section className="setting-section">
          <h3>
            <PaintBucket size={13} /> Paint
          </h3>
          <div className="swatches garage-swatches">
            {paintSwatches.map((swatch) => (
              <button
                key={swatch.color}
                type="button"
                aria-label={`Paint ${swatch.name}`}
                title={swatch.name}
                aria-pressed={paint === swatch.color}
                className={paint === swatch.color ? 'selected' : ''}
                style={{ backgroundColor: swatch.color }}
                disabled={busy}
                onClick={() => setPaint(swatch.color)}
              >
                {paint === swatch.color && <Check size={13} />}
              </button>
            ))}
            <label className="custom-paint" title="Mix your own">
              <input
                type="color"
                value={paint}
                disabled={busy}
                aria-label="Mix your own paint"
                onChange={(event) => setPaint(event.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className="garage-action"
            disabled={busy || paint.toLowerCase() === settings.color.toLowerCase()}
            onClick={() => onJob({ kind: 'paint', color: paint })}
          >
            Spray the new colour
          </button>
        </section>
        <section className="setting-section">
          <h3>
            <Wrench size={13} /> Wheels
          </h3>
          {wheelsAllowed ? (
            <>
              <div className="wheel-options">
                {wheelStyles.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={style === item ? 'selected' : ''}
                    aria-pressed={style === item}
                    disabled={busy}
                    onClick={() => setStyle(item)}
                  >
                    <WheelGlyph style={item} finish={finish} />
                    <span>{wheelStyleNames[item]}</span>
                  </button>
                ))}
              </div>
              <div className="segmented garage-finishes">
                {rimFinishes.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={finish === item ? 'selected' : ''}
                    aria-pressed={finish === item}
                    disabled={busy || style === 'factory'}
                    onClick={() => setFinish(item)}
                  >
                    {rimFinishNames[item]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="garage-action"
                disabled={
                  busy ||
                  (style === settings.wheelStyle &&
                    (style === 'factory' || finish === settings.rimFinish))
                }
                onClick={() => onJob({ kind: 'wheels', style, finish })}
              >
                Fit these wheels
              </button>
            </>
          ) : (
            <p>This one keeps its own wheels. Try a car for new rims.</p>
          )}
        </section>
        <section className="setting-section">
          <h3>
            <Wind size={13} /> Exhaust
          </h3>
          <div className="segmented">
            {exhausts.map((item) => (
              <button
                key={item}
                type="button"
                className={exhaust === item ? 'selected' : ''}
                aria-pressed={exhaust === item}
                disabled={busy}
                onClick={() => setExhaust(item)}
              >
                {exhaustNames[item]}
              </button>
            ))}
          </div>
          <p>
            {exhaust === 'sport'
              ? 'Valves open. Lift off from high revs for a run of crackles and pops, and a sharp bark on every upshift.'
              : 'Quiet and refined. Only the odd burble on a hard lift.'}
          </p>
          <button
            type="button"
            className="garage-action"
            disabled={busy || exhaust === settings.exhaust}
            onClick={() => onJob({ kind: 'exhaust', exhaust })}
          >
            Fit and test the exhaust
          </button>
        </section>
      </div>
      <div className="garage-footer">
        {busy ? (
          <button type="button" className="primary-button garage-skip" onClick={onSkip}>
            <FastForward size={16} /> Skip
          </button>
        ) : (
          <button type="button" className="primary-button" onClick={onLeave}>
            <LogOut size={16} /> Drive out
          </button>
        )}
        <span>
          {busy ? (
            <>
              <kbd>Space</kbd> or <kbd>Enter</kbd> skips ahead
            </>
          ) : (
            <>
              <kbd>Esc</kbd> leaves the garage
            </>
          )}
        </span>
      </div>
    </aside>
  )
}
