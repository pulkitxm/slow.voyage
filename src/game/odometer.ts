export const odometerKey = 'slow-voyage-odometer'
export const odometerPace = { save: 250, show: 100, leap: 400 }

export interface Vault {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export class Odometer {
  total: number
  shown: number
  private saved: number
  private last: number | null = null
  constructor(private vault: Vault | null) {
    let stored = 0
    try {
      stored = Number(vault?.getItem(odometerKey) ?? 0)
    } catch {
      stored = 0
    }
    this.total = Number.isFinite(stored) && stored > 0 ? stored : 0
    this.saved = this.shown = this.total
  }
  record(trip: number) {
    const travelled = this.last === null ? 0 : trip - this.last
    this.last = trip
    if (travelled > 0 && travelled < odometerPace.leap) this.total += travelled
    if (this.total - this.saved >= odometerPace.save) this.keep()
    if (this.total - this.shown < odometerPace.show) return false
    this.shown = this.total
    return true
  }
  keep() {
    if (this.total === this.saved) return
    this.saved = this.total
    try {
      this.vault?.setItem(odometerKey, String(Math.round(this.total)))
    } catch {
      this.vault = null
    }
  }
}
