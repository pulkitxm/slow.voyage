import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { option, run } from './media-capture'

const ticks = 480
const tempo = 120
const beatsPerBar = 4
const totalBars = 52

interface Note {
  at: number
  length: number
  pitch: number
  velocity: number
}

interface Control {
  at: number
  number: number
  value: number
}

interface Part {
  channel: number
  program: number
  volume: number
  pan: number
  reverb: number
  notes: Note[]
  controls: Control[]
}

const parts: Part[] = []

function part(channel: number, program: number, volume: number, pan = 64, reverb = 90) {
  const made: Part = { channel, program, volume, pan, reverb, notes: [], controls: [] }
  parts.push(made)
  return made
}

const beat = (bar: number, offset = 0) => (bar * beatsPerBar + offset) * ticks

function play(
  into: Part,
  bar: number,
  offset: number,
  length: number,
  pitch: number,
  velocity: number,
) {
  into.notes.push({
    at: beat(bar, offset),
    length: Math.max(1, Math.round(length * ticks) - 8),
    pitch,
    velocity: Math.max(1, Math.min(127, Math.round(velocity))),
  })
}

function swell(into: Part, from: number, to: number, start: number, end: number) {
  for (let bar = from; bar <= to; bar += 0.25) {
    const t = to === from ? 1 : (bar - from) / (to - from)
    into.controls.push({ at: beat(bar), number: 11, value: Math.round(start + (end - start) * t) })
  }
}

type Chord = { pad: number[]; strings: number[]; brass: number[]; root: number; arp: number[] }

const chords: Chord[] = [
  {
    pad: [50, 57, 62, 65, 69],
    strings: [62, 65, 69, 74],
    brass: [62, 65, 69],
    root: 38,
    arp: [62, 65, 69, 74],
  },
  {
    pad: [46, 53, 58, 62, 65],
    strings: [58, 62, 65, 70],
    brass: [58, 62, 65],
    root: 34,
    arp: [58, 62, 65, 70],
  },
  {
    pad: [53, 60, 65, 69, 72],
    strings: [60, 65, 69, 72],
    brass: [60, 65, 69],
    root: 41,
    arp: [60, 65, 69, 72],
  },
  {
    pad: [48, 55, 60, 64, 67],
    strings: [60, 64, 67, 72],
    brass: [60, 64, 67],
    root: 36,
    arp: [60, 64, 67, 72],
  },
]
const resolveChord: Chord = {
  pad: [41, 53, 60, 65, 69, 72],
  strings: [57, 60, 65, 69, 77],
  brass: [57, 60, 65],
  root: 29,
  arp: [65, 69, 72, 77],
}

const chordAt = (bar: number) => chords[Math.floor(bar / 2) % 4] as Chord

const motif: [number, number, number][][] = [
  [
    [0, 69, 1],
    [1, 74, 1],
    [2, 76, 1],
    [3, 77, 3],
    [6, 76, 1],
    [7, 74, 1],
  ],
  [
    [0, 74, 3],
    [3, 72, 1],
    [4, 70, 2],
    [6, 69, 2],
  ],
  [
    [0, 69, 1],
    [1, 72, 1],
    [2, 77, 2],
    [4, 76, 2],
    [6, 72, 2],
  ],
  [
    [0, 76, 3],
    [3, 74, 1],
    [4, 72, 2],
    [6, 76, 2],
  ],
]

const pad = part(0, 49, 104, 64, 110)
const choir = part(12, 52, 96, 64, 120)
const piano = part(1, 0, 100, 70, 105)
const strings = part(2, 48, 100, 56, 100)
const cello = part(3, 42, 96, 50, 80)
const ostinato = part(4, 48, 88, 78, 70)
const brass = part(5, 61, 108, 60, 85)
const bass = part(6, 43, 104, 64, 60)
const timpani = part(7, 47, 110, 64, 90)
const sweep = part(8, 119, 90, 64, 100)
const drums = part(9, 0, 127, 64, 55)
const tremolo = part(10, 44, 96, 64, 90)
const pizzicato = part(11, 45, 92, 72, 85)

const drop = 21
const finale = 43
const last = 47

for (let bar = 0; bar < last; bar += 2) {
  const chord = chordAt(bar)
  for (const pitch of chord.pad) play(pad, bar, 0, 8, pitch, bar < 8 ? 64 : 84)
  if (bar < 14 || bar >= finale)
    for (const pitch of chord.strings) play(choir, bar, 0, 8, pitch, 70)
}
for (const pitch of resolveChord.strings) play(choir, last, 0, 18, pitch, 76)
for (const pitch of resolveChord.pad) play(pad, last, 0, 20, pitch, 96)
swell(pad, 0, 8, 48, 84)
swell(pad, 8, 20, 84, 96)
swell(pad, drop, drop, 66, 66)
swell(choir, 0, 8, 40, 80)
swell(choir, finale, last, 80, 110)
swell(pad, finale, last, 90, 110)

const motifBars = (from: number, to: number, velocity: number, octave = 0) => {
  for (let bar = from; bar < to; bar += 2) {
    const phrase = motif[Math.floor(bar / 2) % 4] ?? []
    for (const [offset, pitch, length] of phrase)
      play(piano, bar, offset, length, pitch + octave, velocity - (offset % 2 ? 8 : 0))
  }
}
motifBars(2, 14, 58)
motifBars(drop + 8, finale, 66, 12)
motifBars(finale, last, 62)
play(piano, last, 0, 16, 65, 70)
play(piano, last, 0, 16, 72, 64)
play(piano, last, 0, 16, 77, 66)

for (let bar = 8; bar < last; bar += 2) {
  const chord = chordAt(bar)
  for (const pitch of chord.strings) play(strings, bar, 0, 8, pitch, bar < drop ? 64 : 80)
}
for (const pitch of resolveChord.strings) play(strings, last, 0, 18, pitch, 82)
swell(strings, 8, 20, 36, 112)
swell(strings, drop, finale, 104, 116)
swell(strings, finale, last + 8, 96, 70)

for (let bar = 8; bar < drop; bar++) {
  const root = chordAt(bar).root + 12
  for (let step = 0; step < 8; step++)
    play(cello, bar, step / 2, 0.45, root, 50 + (step % 2 ? 0 : 14) + (bar - 8) * 2.5)
}
for (let bar = drop; bar < finale; bar++) {
  const root = chordAt(bar).root + 12
  for (let step = 0; step < 8; step++)
    play(cello, bar, step / 2, 0.45, step % 4 === 2 ? root + 12 : root, 84 + (step % 2 ? 0 : 16))
}

for (let bar = 14; bar < drop; bar++) {
  const arp = chordAt(bar).arp
  for (let step = 0; step < 8; step++)
    play(
      pizzicato,
      bar,
      step / 2,
      0.4,
      arp[[0, 1, 2, 3, 2, 1, 2, 3][step] ?? 0] ?? 62,
      62 + (bar - 14) * 4,
    )
}
for (let bar = drop; bar < finale; bar++) {
  const arp = chordAt(bar).arp
  for (let step = 0; step < 16; step++)
    play(
      ostinato,
      bar,
      step / 4,
      0.22,
      (arp[[0, 2, 1, 3][step % 4] ?? 0] ?? 62) + 12,
      70 + (step % 4 === 0 ? 24 : 0),
    )
}

for (let bar = drop; bar < finale; bar += 2) {
  const chord = chordAt(bar)
  for (const pitch of chord.brass) {
    play(brass, bar, 0, 3, pitch - 12, 96)
    play(brass, bar, 4, 1.5, pitch - 12, 84)
    play(brass, bar, 5.5, 2.5, pitch - 12, 90)
  }
}
for (const pitch of resolveChord.brass) play(brass, last, 0, 12, pitch - 12, 100)
swell(brass, drop, drop + 1, 70, 110)

for (let bar = drop; bar < finale; bar++) {
  const root = chordAt(bar).root
  for (let step = 0; step < 8; step++)
    play(bass, bar, step / 2, 0.45, root, 92 + (step % 2 ? 0 : 18))
}
play(bass, last, 0, 16, resolveChord.root + 12, 110)

for (let bar = 8; bar < drop - 1; bar += 2)
  play(timpani, bar, 0, 2, chordAt(bar).root + 12, 70 + bar)
for (let step = 0; step < 32; step++) play(timpani, drop - 2, step / 4, 0.25, 50, 40 + step * 2.6)
play(timpani, drop, 0, 4, 38, 124)
for (let bar = drop + 4; bar < finale; bar += 4) play(timpani, bar, 0, 2, 38, 112)
play(timpani, last, 0, 8, 41, 127)

play(sweep, drop - 2, 0, 8, 60, 100)
play(sweep, last - 2, 0, 8, 60, 96)

for (let step = 0; step < 16; step++)
  play(tremolo, drop - 2, step / 2, 0.5, 62 + (step % 2) * 12, 50 + step * 4)
swell(tremolo, drop - 2, drop, 40, 120)

const kick = 36
const snare = 38
const clap = 39
const hat = 42
const crash = 49
const lowTom = 41
const midTom = 45
const highTom = 48
for (let bar = 14; bar < drop; bar++) play(drums, bar, 0, 0.5, kick, 70 + (bar - 14) * 5)
for (let step = 0; step < 16; step++) play(drums, drop - 1, step / 4, 0.25, snare, 40 + step * 5)
for (let bar = drop; bar < finale; bar++) {
  play(drums, bar, 0, 0.5, kick, 120)
  play(drums, bar, 1.5, 0.5, kick, 96)
  play(drums, bar, 2, 0.5, kick, 116)
  play(drums, bar, 1, 0.5, snare, 112)
  play(drums, bar, 3, 0.5, snare, 118)
  play(drums, bar, 3, 0.5, clap, 90)
  for (let step = 0; step < 8; step++) play(drums, bar, step / 2, 0.25, hat, step % 2 ? 54 : 74)
  if ((bar - drop) % 4 === 0) play(drums, bar, 0, 2, crash, 112)
  if ((bar - drop) % 4 === 3)
    [highTom, highTom, midTom, midTom, lowTom, lowTom, lowTom, lowTom].forEach((tom, index) => {
      play(drums, bar, 2 + index / 4, 0.25, tom, 96 + index * 3)
    })
}
play(drums, last, 0, 4, crash, 127)
play(drums, last, 0, 1, kick, 127)

function vlq(value: number) {
  const bytes = [value & 0x7f]
  let rest = value >> 7
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80)
    rest >>= 7
  }
  return bytes
}

function chunk(type: string, data: number[]) {
  const length = data.length
  return [
    ...[...type].map((letter) => letter.charCodeAt(0)),
    (length >> 24) & 255,
    (length >> 16) & 255,
    (length >> 8) & 255,
    length & 255,
    ...data,
  ]
}

const priority: Record<number, number> = { 255: 0, 192: 1, 176: 2, 128: 3, 144: 4 }
const order = (bytes: number[]) =>
  priority[(bytes[0] ?? 0) === 0xff ? 0xff : (bytes[0] ?? 0) & 0xf0] ?? 5

function track(events: [number, number[]][]) {
  events.sort((a, b) => a[0] - b[0] || order(a[1]) - order(b[1]))
  const data: number[] = []
  let time = 0
  for (const [at, bytes] of events) {
    data.push(...vlq(at - time), ...bytes)
    time = at
  }
  data.push(0, 0xff, 0x2f, 0)
  return chunk('MTrk', data)
}

const microseconds = Math.round(60_000_000 / tempo)
const conductor = track([
  [0, [0xff, 0x51, 3, (microseconds >> 16) & 255, (microseconds >> 8) & 255, microseconds & 255]],
  [0, [0xff, 0x58, 4, 4, 2, 24, 8]],
  [beat(totalBars), [0xff, 0x01, 1, 0x2e]],
])
const tracks = parts.map((each) => {
  const status = (kind: number) => kind | each.channel
  const events: [number, number[]][] = [
    [0, [status(0xc0), each.program]],
    [0, [status(0xb0), 7, each.volume]],
    [0, [status(0xb0), 10, each.pan]],
    [0, [status(0xb0), 91, each.reverb]],
    [0, [status(0xb0), 11, 100]],
  ]
  for (const control of each.controls)
    events.push([control.at, [status(0xb0), control.number, control.value]])
  for (const note of each.notes) {
    events.push([note.at, [status(0x90), note.pitch, note.velocity]])
    events.push([note.at + note.length, [status(0x80), note.pitch, 0]])
  }
  return track(events)
})
const header = chunk('MThd', [0, 1, 0, tracks.length + 1, (ticks >> 8) & 255, ticks & 255])
const midi = new Uint8Array([...header, ...conductor, ...tracks.flat()])

const out = resolve(option('out') ?? '.review/trailer')
const font =
  option('soundfont') ?? resolve(homedir(), '.local/share/soundfonts/MuseScore_General.sf3')
await mkdir(out, { recursive: true })
await Bun.write(`${out}/score.mid`, midi)
await run([
  'fluidsynth',
  '-ni',
  '-q',
  '-g',
  '0.45',
  '-r',
  '48000',
  '-o',
  'synth.reverb.room-size=0.86',
  '-o',
  'synth.reverb.width=1',
  '-o',
  'synth.reverb.level=0.8',
  '-o',
  'synth.reverb.damp=0.3',
  '-F',
  `${out}/score-dry.wav`,
  font,
  `${out}/score.mid`,
])
const seconds = (totalBars * beatsPerBar * 60) / tempo
const shape = `atrim=0:${seconds},acompressor=threshold=-18dB:ratio=2:attack=30:release=400,aecho=0.8:0.6:60|120:0.16|0.1,afade=t=out:st=${seconds - 4}:d=4`
const probe = Bun.spawn(
  [
    'ffmpeg',
    '-hide_banner',
    '-i',
    `${out}/score-dry.wav`,
    '-af',
    `${shape},volumedetect`,
    '-f',
    'null',
    '-',
  ],
  { stderr: 'pipe' },
)
const report = await new Response(probe.stderr).text()
await probe.exited
const peak = Number(/max_volume: (-?[\d.]+) dB/.exec(report)?.[1] ?? 0)
await run([
  'ffmpeg',
  '-loglevel',
  'error',
  '-y',
  '-i',
  `${out}/score-dry.wav`,
  '-af',
  `${shape},volume=${(-1.5 - peak).toFixed(2)}dB`,
  '-ar',
  '48000',
  `${out}/score.wav`,
])
console.log(`Score: ${out}/score.wav`)
