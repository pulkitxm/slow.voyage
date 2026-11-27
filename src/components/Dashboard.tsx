import { ArrowUp } from 'lucide-react'
import { minimapLayout } from '../game/minimap'
import type { Settings } from '../game/world'
import { type TelemetryStore, useTelemetry } from '../telemetry'

const speedScale = (units: Settings['units']) => (units === 'km' ? 3.6 : 2.23694)
const distanceScale = (units: Settings['units']) => (units === 'km' ? 1000 : 1609.344)

type Aids = Pick<Settings, 'antilock' | 'brakeDistribution' | 'tractionControl'>

function AidLamps({ store, aids }: { store: TelemetryStore; aids: Aids }) {
  const antilock = useTelemetry(store, (state) => state.antilock)
  const traction = useTelemetry(store, (state) => state.traction)
  const stability = useTelemetry(store, (state) => state.stability)
  const lamps = [
    { id: 'abs', label: 'ABS', active: antilock, off: !aids.antilock, title: 'Antilock brakes' },
    {
      id: 'ebd',
      label: 'EBD',
      active: false,
      off: !aids.brakeDistribution,
      title: 'Brake force distribution',
    },
    {
      id: 'tcs',
      label: 'TCS',
      active: traction,
      off: !aids.tractionControl,
      title: 'Traction control',
    },
    { id: 'esc', label: 'ESC', active: stability, off: false, title: 'Stability control' },
  ].filter((lamp) => lamp.active || lamp.off)
  if (!lamps.length) return null
  return (
    <span className="aid-lamps" aria-hidden="true">
      {lamps.map((lamp) => (
        <span
          key={lamp.id}
          className="aid-lamp"
          data-aid={lamp.id}
          data-state={lamp.off ? 'off' : 'active'}
          title={`${lamp.title} ${lamp.off ? 'off' : 'working'}`}
        >
          {lamp.label}
          {lamp.off && <small>OFF</small>}
        </span>
      ))}
    </span>
  )
}

export function Speed({
  store,
  units,
  manual,
  quiet,
  aids,
}: {
  store: TelemetryStore
  units: Settings['units']
  manual: boolean
  quiet: boolean
  aids: Aids
}) {
  const speed = useTelemetry(store, (state) =>
    Math.round(Math.abs(state.speed) * speedScale(units)),
  )
  const gear = useTelemetry(store, (state) => state.gear)
  const strain = useTelemetry(store, (state) =>
    manual && state.revs > 0.9 ? (state.limited ? 'gear gear-limit' : 'gear gear-shift') : 'gear',
  )
  const boost = useTelemetry(store, (state) => state.boost)
  const nitro = useTelemetry(store, (state) => Math.round(state.nitro * 100))
  return (
    <div className="speed">
      {boost && !quiet && <span className="boost-indicator">BOOST</span>}
      {!quiet && <AidLamps store={store} aids={aids} />}
      <span className="speed-value">{String(speed).padStart(2, '0')}</span>
      <span className="speed-unit">
        {units === 'km' ? 'km/h' : 'mph'}
        <span className={strain}>{gear}</span>
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
