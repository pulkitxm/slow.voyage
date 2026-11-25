import { PNG } from 'pngjs'

export function transform(real: Float64Array, imaginary: Float64Array) {
  const size = real.length
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const r = real[i] as number
      real[i] = real[j] as number
      real[j] = r
      const m = imaginary[i] as number
      imaginary[i] = imaginary[j] as number
      imaginary[j] = m
    }
  }
  for (let span = 2; span <= size; span <<= 1) {
    const angle = (-2 * Math.PI) / span
    const stepR = Math.cos(angle)
    const stepI = Math.sin(angle)
    for (let start = 0; start < size; start += span) {
      let turnR = 1
      let turnI = 0
      for (let k = 0; k < span / 2; k++) {
        const a = start + k
        const b = a + span / 2
        const r = (real[b] as number) * turnR - (imaginary[b] as number) * turnI
        const m = (real[b] as number) * turnI + (imaginary[b] as number) * turnR
        real[b] = (real[a] as number) - r
        imaginary[b] = (imaginary[a] as number) - m
        real[a] = (real[a] as number) + r
        imaginary[a] = (imaginary[a] as number) + m
        const next = turnR * stepR - turnI * stepI
        turnI = turnR * stepI + turnI * stepR
        turnR = next
      }
    }
  }
}

export function spectrum(signal: Float32Array, start: number, size: number) {
  const real = new Float64Array(size)
  const imaginary = new Float64Array(size)
  for (let i = 0; i < size; i++) {
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1))
    real[i] = (signal[start + i] ?? 0) * window
  }
  transform(real, imaginary)
  const magnitude = new Float64Array(size / 2)
  for (let i = 0; i < size / 2; i++)
    magnitude[i] = (Math.hypot(real[i] as number, imaginary[i] as number) * 4) / size
  return magnitude
}

export function peakNear(magnitude: Float64Array, rate: number, frequency: number, span = 0.04) {
  const size = magnitude.length * 2
  const from = Math.max(1, Math.floor((frequency * (1 - span) * size) / rate))
  const to = Math.min(magnitude.length - 2, Math.ceil((frequency * (1 + span) * size) / rate))
  let best = from
  for (let bin = from; bin <= to; bin++)
    if ((magnitude[bin] as number) > (magnitude[best] as number)) best = bin
  const a = Math.log((magnitude[best - 1] as number) + 1e-30)
  const b = Math.log((magnitude[best] as number) + 1e-30)
  const c = Math.log((magnitude[best + 1] as number) + 1e-30)
  const shift = (0.5 * (a - c)) / (a - 2 * b + c || 1)
  return { frequency: ((best + shift) * rate) / size, level: magnitude[best] as number }
}

export function levels(signal: Float32Array) {
  let peak = 0
  let sum = 0
  let squares = 0
  for (let i = 0; i < signal.length; i++) {
    const value = signal[i] as number
    peak = Math.max(peak, Math.abs(value))
    sum += value
    squares += value * value
  }
  const count = Math.max(1, signal.length)
  return { peak, offset: sum / count, rms: Math.sqrt(squares / count) }
}

export function decibels(value: number) {
  return 20 * Math.log10(Math.max(value, 1e-12))
}

export function frameRateRipple(signal: Float32Array, rate: number, frames = 60) {
  const bin = Math.round(rate / 1000)
  const count = Math.floor(signal.length / bin)
  let size = 1
  while (size * 2 <= count) size *= 2
  const envelope = new Float32Array(size)
  let before = 0
  let earlier = 0
  for (let i = 0; i < size; i++) {
    let sum = 0
    for (let k = 0; k < bin; k++) {
      const value = signal[i * bin + k] as number
      sum += Math.abs(value - 2 * before + earlier)
      earlier = before
      before = value
    }
    envelope[i] = sum / bin
  }
  const magnitude = spectrum(envelope, 0, size)
  const at = (frequency: number) => Math.round((frequency * size) / 1000)
  let total = 0
  const harmonics = 3
  for (let harmonic = 1; harmonic <= harmonics; harmonic++) {
    const centre = at(frames * harmonic)
    let line = 0
    for (let k = centre - 1; k <= centre + 1; k++) line = Math.max(line, magnitude[k] as number)
    const around: number[] = []
    for (let k = at(frames * (harmonic - 0.4)); k <= at(frames * (harmonic + 0.4)); k++)
      if (Math.abs(k - centre) > 3) around.push(magnitude[k] as number)
    around.sort((a, b) => a - b)
    total += decibels(line / Math.max(around[Math.floor(around.length / 2)] ?? 1e-12, 1e-12))
  }
  return total / harmonics
}

export function wave(channels: Float32Array[], rate: number) {
  const frames = channels[0]?.length ?? 0
  const bytes = frames * channels.length * 2
  const buffer = new ArrayBuffer(44 + bytes)
  const view = new DataView(buffer)
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i))
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + bytes, true)
  text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels.length, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * channels.length * 2, true)
  view.setUint16(32, channels.length * 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, bytes, true)
  let at = 44
  for (let frame = 0; frame < frames; frame++)
    for (const channel of channels) {
      const value = Math.max(-1, Math.min(1, channel[frame] as number))
      view.setInt16(at, Math.round(value * 32767), true)
      at += 2
    }
  return new Uint8Array(buffer)
}

const heat = [
  [0, 0, 4],
  [40, 11, 84],
  [101, 21, 110],
  [159, 42, 99],
  [212, 72, 66],
  [245, 125, 21],
  [250, 193, 39],
  [252, 255, 164],
] as const

export function spectrogram(signal: Float32Array, rate: number, width = 1100, height = 420) {
  const size = 4096
  const png = new PNG({ width, height })
  const lowest = 20
  const highest = Math.min(16000, rate / 2)
  const hop = Math.max(1, (signal.length - size) / width)
  for (let x = 0; x < width; x++) {
    const magnitude = spectrum(signal, Math.floor(x * hop), size)
    for (let y = 0; y < height; y++) {
      const frequency = lowest * (highest / lowest) ** (1 - y / (height - 1))
      const position = (frequency * size) / rate
      const bin = Math.min(magnitude.length - 2, Math.floor(position))
      const blend = position - bin
      const level =
        (magnitude[bin] as number) * (1 - blend) + (magnitude[bin + 1] as number) * blend
      const shade = Math.max(0, Math.min(0.9999, (decibels(level) + 100) / 80)) * (heat.length - 1)
      const from = heat[Math.floor(shade)] ?? heat[0]
      const to = heat[Math.floor(shade) + 1] ?? from
      const mix = shade - Math.floor(shade)
      const at = (y * width + x) * 4
      for (let c = 0; c < 3; c++)
        png.data[at + c] = Math.round(
          (from[c] as number) + ((to[c] as number) - (from[c] as number)) * mix,
        )
      png.data[at + 3] = 255
    }
  }
  return PNG.sync.write(png)
}
