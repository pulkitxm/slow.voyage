import { ArrowUp } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { minimapLayout } from '../game/minimap'
import { type Needle, stepNeedle, tachAngle, tachScale } from '../game/tachometer'
import type { Settings } from '../game/world'
import { type TelemetryStore, useTelemetry } from '../telemetry'

const speedScale = (units: Settings['units']) => (units === 'km' ? 3.6 : 2.23694)
const distanceScale = (units: Settings['units']) => (units === 'km' ? 1000 : 1609.344)

export function Speed({
  store,
  units,
  manual,
  quiet,
  onNeutral,
}: {
  store: TelemetryStore
  units: Settings['units']
  manual: boolean
  quiet: boolean
  onNeutral: () => void
}) {
  const speed = useTelemetry(store, (state) =>
    Math.round(Math.abs(state.speed) * speedScale(units)),
  )
  const gear = useTelemetry(store, (state) => state.gear)
  const strain = useTelemetry(store, (state) =>
    (manual || state.gear === 'N') && state.revs > 0.9
      ? state.limited
        ? 'gear gear-limit'
        : 'gear gear-shift'
      : 'gear',
  )
  const boost = useTelemetry(store, (state) => state.boost)
  const nitro = useTelemetry(store, (state) => Math.round(state.nitro * 100))
  return (
    <div className="speed">
      {boost && !quiet && <span className="boost-indicator">BOOST</span>}
      <span className="speed-value">{String(speed).padStart(2, '0')}</span>
      <span className="speed-unit">
        {units === 'km' ? 'km/h' : 'mph'}
        <button
          type="button"
          aria-label={gear === 'N' ? 'Neutral. Select to engage a gear' : 'Shift into neutral'}
          title="Neutral (Z)"
          onClick={onNeutral}
          className={strain}
        >
          {gear}
        </button>
      </span>
      <div className="speed-track">
        <span style={{ width: `${Math.min(speed / 2, 100)}%` }} />
      </div>
      <div className="nitro-track" data-firing={boost} title="Boost charge">
        <span style={{ width: `${nitro}%` }} />
      </div>
    </div>
  )
}

const dial = { x: 60, y: 60, r: 56, hub: 12 }
const onDial = (angle: number, radius: number) => {
  const turn = (angle * Math.PI) / 180
  return [dial.x + radius * Math.sin(turn), dial.y - radius * Math.cos(turn)] as const
}
const arc = (from: number, to: number, radius: number) => {
  const [x0, y0] = onDial(from, radius)
  const [x1, y1] = onDial(to, radius)
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

function DialFace({ redline }: { redline: number }) {
  const scale = tachScale(redline)
  const at = (value: number) => tachAngle(value, scale.max)
  const halves = scale.max <= 4000
  return (
    <>
      <path className="dial-rim" d={arc(at(0), at(scale.max), dial.r)} />
      <path className="dial-shift" d={arc(at(scale.shift), at(scale.redline), dial.r - 3)} />
      <path className="dial-red" d={arc(at(scale.redline), at(scale.max), dial.r - 3.5)} />
      {scale.ticks.map((value) => {
        const major = halves || value % 1000 === 0
        const labelled = scale.labels.includes(value)
        const [x0, y0] = onDial(at(value), dial.r - 1.5)
        const [x1, y1] = onDial(at(value), dial.r - (labelled ? 9 : major ? 6 : 4))
        return (
          <line
            key={value}
            className={labelled ? 'dial-tick major' : 'dial-tick'}
            data-red={value > scale.redline}
            x1={x0}
            y1={y0}
            x2={x1}
            y2={y1}
          />
        )
      })}
      {scale.labels.map((value) => {
        const [x, y] = onDial(at(value), dial.r - 16)
        return (
          <text key={value} className="dial-label" x={x} y={y}>
            {value / 1000}
          </text>
        )
      })}
      <text className="dial-caption" x={dial.x - 22} y={dial.y + 4}>
        ×1000
      </text>
      <text className="dial-caption" x={dial.x - 22} y={dial.y + 11}>
        RPM
      </text>
    </>
  )
}

export function Cluster({
  store,
  units,
  manual,
  quiet,
  redline,
  live,
  onNeutral,
}: {
  store: TelemetryStore
  units: Settings['units']
  manual: boolean
  quiet: boolean
  redline: number
  live: () => number | null
  onNeutral: () => void
}) {
  const max = tachScale(redline).max
  const face = useMemo(() => <DialFace redline={redline} />, [redline])
  const needle = useRef<SVGLineElement>(null)
  const reading = useRef({ redline, max, live })
  reading.current = { redline, max, live }
  useLayoutEffect(() => {
    const line = needle.current
    if (!line) return
    const calm = matchMedia('(prefers-reduced-motion: reduce)')
    const target = () => {
      const { redline, max, live } = reading.current
      return ((live() ?? store.state.revs) * redline) / max
    }
    let state: Needle = { position: target(), velocity: 0 }
    let shown = ''
    const draw = () => {
      const angle = tachAngle(state.position * reading.current.max, reading.current.max)
      const transform = `rotate(${angle.toFixed(2)} ${dial.x} ${dial.y})`
      if (transform !== shown) line.setAttribute('transform', transform)
      shown = transform
    }
    draw()
    let last = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      state = stepNeedle(state, target(), dt, calm.matches)
      draw()
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [store])
  const speed = useTelemetry(store, (state) =>
    Math.round(Math.abs(state.speed) * speedScale(units)),
  )
  const gear = useTelemetry(store, (state) => state.gear)
  const strain = useTelemetry(store, (state) =>
    (manual || state.gear === 'N') && state.revs > 0.9
      ? state.limited
        ? 'limit'
        : 'shift'
      : 'calm',
  )
  const boost = useTelemetry(store, (state) => state.boost)
  const nitro = useTelemetry(store, (state) => Math.round(state.nitro * 100))
  return (
    <div className="cluster" data-strain={strain}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        {face}
        <line
          ref={needle}
          className="dial-needle"
          x1={dial.x}
          y1={dial.y - dial.hub - 1}
          x2={dial.x}
          y2={dial.y - dial.r + 4}
        />
      </svg>
      <button
        type="button"
        className="cluster-gear"
        aria-label={gear === 'N' ? 'Neutral. Select to engage a gear' : 'Shift into neutral'}
        title="Neutral (Z)"
        onClick={onNeutral}
      >
        {gear}
      </button>
      <div className="cluster-readout">
        <span className="cluster-unit">
          {boost && !quiet && <span className="cluster-boost">BOOST</span>}
          {units === 'km' ? 'km/h' : 'mph'}
        </span>
        <span className="cluster-speed">{speed}</span>
        <div className="nitro-track" data-firing={boost} title="Boost charge">
          <span style={{ width: `${nitro}%` }} />
        </div>
      </div>
    </div>
  )
}

export function Trip({
  store,
  units,
  lifetime,
}: {
  store: TelemetryStore
  units: Settings['units']
  lifetime: number
}) {
  const tenths = useTelemetry(store, (state) =>
    Math.round((state.distance / distanceScale(units)) * 10),
  )
  return (
    <div className="distance">
      <span className="distance-value">{(tenths / 10).toFixed(1)}</span>
      <span>{units === 'km' ? 'km' : 'mi'}</span>
      <span className="distance-lifetime">
        {Math.round(lifetime / distanceScale(units)).toLocaleString()}{' '}
        {units === 'km' ? 'km' : 'mi'} all time
      </span>
    </div>
  )
}

export function RoadFinder({ store, units }: { store: TelemetryStore; units: Settings['units'] }) {
  const away = useTelemetry(store, (state) =>
    state.roadDistance > minimapLayout.guideDistance
      ? Math.round(state.roadDistance * (units === 'km' ? 1 : 3.28084))
      : 0,
  )
  if (!away) return null
  return (
    <div className="road-finder">
      ROAD {away} {units === 'km' ? 'm' : 'ft'}
    </div>
  )
}

export function MouseBar({ store }: { store: TelemetryStore }) {
  const steer = useTelemetry(store, (state) => state.mouseSteering.toFixed(2))
  return (
    <div className="mouse-steering" data-mouse-steer={steer} aria-hidden="true">
      <div className="mouse-track">
        <i style={{ left: `${50 - Number(steer) * 50}%` }} />
      </div>
    </div>
  )
}

export const turnBack = { from: 120, step: 10, turn: 15 }

export function TurnBack({ store, units }: { store: TelemetryStore; units: Settings['units'] }) {
  const away = useTelemetry(store, (state) =>
    state.roadDistance > turnBack.from
      ? Math.round((state.roadDistance * (units === 'km' ? 1 : 3.28084)) / turnBack.step) *
        turnBack.step
      : 0,
  )
  const bearing = useTelemetry(store, (state) =>
    Math.round((state.roadBearing * 180) / Math.PI / turnBack.turn),
  )
  if (!away) return null
  return (
    <div className="turn-back" role="status">
      <span style={{ transform: `rotate(${bearing * turnBack.turn}deg)` }}>
        <ArrowUp size={18} />
      </span>
      <b>Back to the road</b>
      <em>
        {away.toLocaleString()} {units === 'km' ? 'm' : 'ft'}
      </em>
    </div>
  )
}
