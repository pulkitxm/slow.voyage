import { useSyncExternalStore } from 'react'
import type { DriveState } from './game/engine'

export class TelemetryStore {
  private listeners = new Set<() => void>()
  constructor(public state: DriveState) {}

  set = (state: DriveState) => {
    this.state = state
    for (const listener of this.listeners) listener()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

export function useTelemetry<T extends string | number | boolean>(
  store: TelemetryStore,
  pick: (state: DriveState) => T,
) {
  const read = () => pick(store.state)
  return useSyncExternalStore(store.subscribe, read, read)
}
