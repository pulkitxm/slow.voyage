export const crossfadeTiming = {
  settleFrames: 3,
  settleTime: 300,
  duration: 1400,
  reducedDuration: 250,
}

export function veilReady(frames: number, waited: number) {
  return (
    frames >= crossfadeTiming.settleFrames || (frames >= 1 && waited >= crossfadeTiming.settleTime)
  )
}

export class SceneCrossfade {
  private veil: HTMLCanvasElement | null = null
  private settled = -1
  private since = 0
  private duration: number = crossfadeTiming.duration

  constructor(private source: HTMLCanvasElement) {}

  get active() {
    return this.veil !== null
  }

  capture(duration: number = crossfadeTiming.duration) {
    const { source } = this
    if (!source.parentElement || !source.width || !source.height) return
    const veil = document.createElement('canvas')
    veil.width = source.width
    veil.height = source.height
    veil.className = 'scene-veil'
    veil.setAttribute('aria-hidden', 'true')
    const context = veil.getContext('2d')
    if (!context) return
    context.drawImage(source, 0, 0)
    const previous = this.veil
    if (previous) {
      context.globalAlpha = Number(getComputedStyle(previous).opacity) || 0
      context.drawImage(previous, 0, 0, veil.width, veil.height)
      previous.remove()
    }
    source.after(veil)
    this.veil = veil
    this.settled = 0
    this.since = performance.now()
    this.duration = duration
  }

  rendered() {
    const veil = this.veil
    if (!veil || this.settled < 0) return
    this.settled++
    if (!veilReady(this.settled, performance.now() - this.since)) return
    this.settled = -1
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const duration = reduced
      ? Math.min(this.duration, crossfadeTiming.reducedDuration)
      : this.duration
    veil.style.transition = `opacity ${duration}ms cubic-bezier(0.45, 0, 0.25, 1)`
    void veil.offsetWidth
    veil.style.opacity = '0'
    const finish = () => {
      veil.remove()
      if (this.veil === veil) this.veil = null
    }
    veil.addEventListener('transitionend', finish, { once: true })
    setTimeout(finish, duration + 200)
  }

  dispose() {
    this.veil?.remove()
    this.veil = null
  }
}
