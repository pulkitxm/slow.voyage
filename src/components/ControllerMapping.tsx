import { useEffect, useRef, useState } from 'react'
import {
  type ControllerBindings,
  type ControllerChannel,
  type ControllerMode,
  controllerGroups,
  controllerLabels,
  readBinding,
  standardBindings,
} from '../game/controller-bindings'
import {
  advanceCalibration,
  beginCalibration,
  type ControllerCalibration,
  finishCalibration,
} from '../game/controller-calibration'
import type { PadSnapshot } from '../game/gamepad'

interface Props {
  mode: ControllerMode
  bindings: ControllerBindings
  onMode: (mode: ControllerMode) => void
  onBindings: (bindings: ControllerBindings) => void
}

export function ControllerMapping({ mode, bindings, onMode, onBindings }: Props) {
  const [sample, setSample] = useState<{
    pads: PadSnapshot[]
    calibration: ControllerCalibration | null
    unavailable: boolean
  }>({ pads: [], calibration: null, unavailable: false })
  const [target, setTarget] = useState<ControllerChannel | null>(null)
  const [preset, setPreset] = useState('')
  const session = useRef<ControllerCalibration | null>(null)
  const captureCard = useRef<HTMLDivElement>(null)
  const bindingButtons = useRef(new Map<ControllerChannel, HTMLButtonElement>())
  useEffect(() => {
    let frame = 0
    let lastSample = 0
    const poll = (time: number) => {
      let pads: PadSnapshot[] = []
      let unavailable = false
      try {
        pads = Array.from(navigator.getGamepads()).filter((pad): pad is Gamepad => !!pad?.connected)
      } catch {
        unavailable = true
      }
      if (session.current) {
        if (document.hidden || !document.hasFocus())
          session.current = { ...session.current, lost: true, released: false }
        else session.current = advanceCalibration(session.current, pads)
      }
      if (time - lastSample >= 80) {
        setSample({ pads, calibration: session.current, unavailable })
        lastSample = time
      }
      frame = requestAnimationFrame(poll)
    }
    frame = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(frame)
  }, [])
  useEffect(() => {
    if (target) {
      captureCard.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [target])
  const uniquePads = sample.pads.filter(
    (pad) => pad.id.length && sample.pads.filter((other) => other.id === pad.id).length === 1,
  )
  const standardPads = uniquePads.filter((pad) => pad.mapping === 'standard')
  const canBind = uniquePads.some((pad) => pad.axes.length || pad.buttons.length)
  const canStart =
    canBind &&
    uniquePads.every((pad) =>
      pad.buttons.every((button) => !(Number.isFinite(button.value) && button.value > 0.1)),
    )
  const cancel = () => {
    const previous = target
    session.current = null
    setTarget(null)
    setSample((current) => ({ ...current, calibration: null }))
    if (previous) requestAnimationFrame(() => bindingButtons.current.get(previous)?.focus())
  }
  const prepare = (channel: ControllerChannel) => {
    session.current = null
    setSample((current) => ({ ...current, calibration: null }))
    setTarget(channel)
    requestAnimationFrame(() =>
      captureCard.current
        ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
        ?.focus({ preventScroll: true }),
    )
  }
  const ready = () => {
    try {
      session.current = beginCalibration(navigator.getGamepads())
      setSample((current) => ({ ...current, calibration: session.current }))
      requestAnimationFrame(() => captureCard.current?.focus({ preventScroll: true }))
    } catch {
      session.current = null
    }
  }
  const save = () => {
    if (!target || !session.current) return
    try {
      session.current = advanceCalibration(session.current, navigator.getGamepads())
    } catch {
      return
    }
    const binding = finishCalibration(session.current)
    if (!binding) return
    onBindings({ ...bindings, [target]: binding })
    cancel()
  }
  const clear = (channel: ControllerChannel) => {
    const next = { ...bindings }
    delete next[channel]
    onBindings(next)
    if (target === channel) cancel()
  }
  const rows = (labels: Record<string, string>) =>
    Object.entries(labels).map(([key, label]) => {
      const channel = key as ControllerChannel
      const binding = bindings[channel]
      const matches = binding ? sample.pads.filter((pad) => pad.id === binding.deviceId) : []
      return (
        <div className="binding-row" key={channel} data-binding={channel}>
          <div className="binding-description">
            <span>{label}</span>
            <small title={binding?.deviceId}>
              {binding
                ? `${binding.kind === 'axis' ? 'Axis' : 'Button'} ${binding.index + 1} · ${binding.deviceId}${matches.length !== 1 ? ' · unavailable' : ''}`
                : 'Unbound'}
            </small>
            <meter
              className="binding-meter"
              min="0"
              max="1"
              value={readBinding(sample.pads, binding)}
              aria-label={`${label} input`}
            />
          </div>
          <button
            type="button"
            className="mapping-button"
            aria-label={`Bind ${label}`}
            disabled={!canBind}
            ref={(element) => {
              if (element) bindingButtons.current.set(channel, element)
              else bindingButtons.current.delete(channel)
            }}
            onClick={() => prepare(channel)}
          >
            {binding ? 'Change' : 'Bind'}
          </button>
          <button
            type="button"
            className="mapping-clear"
            aria-label={`Clear ${label} binding`}
            disabled={!binding}
            onClick={() => clear(channel)}
          >
            ×
          </button>
        </div>
      )
    })
  const calibration = sample.calibration
  return (
    <div className="controller-mapping">
      <h3>Controller layout</h3>
      <div className="segmented">
        {(['standard', 'custom'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={mode === value ? 'selected' : ''}
            aria-pressed={mode === value}
            onClick={() => {
              cancel()
              onMode(value)
            }}
          >
            {value}
          </button>
        ))}
      </div>
      {mode === 'standard' ? (
        <p>
          Use the standard stick, trigger and button layout. Choose Custom for a wheel, separate
          pedals or your own bindings.
        </p>
      ) : (
        <>
          <p>
            Bind controls from any connected device. Release or center each control before capturing
            its movement.
          </p>
          <p role="status">
            {sample.unavailable
              ? 'Controller access is unavailable.'
              : !sample.pads.length
                ? 'Connect a controller and press a button to make it available.'
                : uniquePads.length !== sample.pads.length
                  ? 'Matching device names are ambiguous. Keep one of each connected while binding.'
                  : `${uniquePads.length} ${uniquePads.length === 1 ? 'device' : 'devices'} available. Release controls after changing bindings.`}
          </p>
          {standardPads.length > 0 && (
            <div className="mapping-preset">
              <label htmlFor="controller-preset">Copy a standard layout</label>
              <p>Copying replaces the current custom bindings.</p>
              <select
                id="controller-preset"
                value={preset}
                onChange={(event) => setPreset(event.target.value)}
              >
                <option value="">Choose a controller</option>
                {standardPads.map((pad) => (
                  <option key={pad.id} value={pad.id}>
                    {pad.id}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="mapping-button"
                disabled={!standardPads.some((pad) => pad.id === preset)}
                onClick={() => {
                  cancel()
                  onBindings(standardBindings(preset))
                }}
              >
                Copy layout
              </button>
            </div>
          )}
          {target && (
            <div
              className="mapping-capture"
              ref={captureCard}
              data-calibrating={target}
              tabIndex={-1}
            >
              <h4>{controllerLabels[target]}</h4>
              <p role="status">
                {!calibration
                  ? 'Release buttons and pedals. Center sticks and wheels, then choose Ready.'
                  : calibration.lost
                    ? 'The device connection or focus changed. Start again with released controls.'
                    : !calibration.binding
                      ? `Move ${controllerLabels[target].toLowerCase()} fully, then release or center it.`
                      : calibration.released
                        ? 'Released. Save this binding, or start again.'
                        : 'Move through the full travel in this direction, then release or center the control.'}
              </p>
              {calibration?.binding && (
                <>
                  <small>
                    {calibration.binding.deviceId} ·{' '}
                    {calibration.binding.kind === 'axis' ? 'Axis' : 'Button'}{' '}
                    {calibration.binding.index + 1}
                  </small>
                  <small>
                    Rest {calibration.binding.from.toFixed(2)} · Full{' '}
                    {calibration.binding.to.toFixed(2)}
                  </small>
                </>
              )}
              <div className="mapping-capture-actions">
                {!calibration ? (
                  <button
                    type="button"
                    className="mapping-button"
                    disabled={!canStart}
                    onClick={ready}
                  >
                    Ready
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="mapping-button"
                      aria-label={`Save ${controllerLabels[target]} binding`}
                      disabled={!finishCalibration(calibration)}
                      onClick={save}
                    >
                      Save binding
                    </button>
                    <button
                      type="button"
                      className="mapping-button"
                      onClick={() => prepare(target)}
                    >
                      Start again
                    </button>
                  </>
                )}
                <button type="button" className="mapping-button" onClick={cancel}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div className="mapping-group">
            <h4>Driving</h4>
            {rows(controllerGroups.Driving)}
          </div>
          <details className="mapping-group">
            <summary>Shortcuts</summary>
            {rows(controllerGroups.Shortcuts)}
          </details>
          <details className="mapping-group">
            <summary>Camera</summary>
            <p>
              Optional look and zoom controls are unbound by default. Bonnet look recenters when
              released.
            </p>
            {rows(controllerGroups.Camera)}
          </details>
        </>
      )}
    </div>
  )
}
