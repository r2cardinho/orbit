// Soft interface sounds, made in the browser with the Web Audio API (no audio files).
//
// Every sound is made of "notes": an oscillator (a wave at some frequency) whose volume
// rises and fades, which is what makes it sound like a struck note and not a beep.
// All notes go through the same chain before reaching the speakers:
//
//   notes → bus ─┬───────────────────────┬→ soft filter → volume → speakers
//                └→ reverb (made-up room) ┘
//
// - the reverb adds a little space around each note, fitting the "orbit" theme;
// - the filter takes away harsh highs.
// There is no compressor on purpose: the browser's one changes the volume of each note
// in unpredictable ways (the first one comes out much quieter). The levels below are
// low enough that even 12 pops at once stay well under the maximum.
//
// Sounds start off. The choice is remembered in localStorage for the next visit.
// They never carry information on their own: everything they mark is also on screen.
// Browsers only allow audio after the user clicks something on the page, so the
// audio engine is created on the first sound, which always follows a click.

const STORAGE_KEY = 'orbit:sounds'

// Sound tuning. Not design tokens: they shape the audio, not the look.
const MASTER_VOLUME = 0.7
const REVERB_SECONDS = 1.6 // how long the made-up room keeps echoing
const REVERB_MIX = 0.25 // how much echo is mixed in (0 = none)
const BRIGHTNESS = 6500 // Hz; the filter softens everything above it
const MAX_POPS = 12 // a big expansion plays at most this many pops
const POP_GAP = 0.045 // seconds between two pops
// Sounds are scheduled this many seconds ahead. A note set for exactly "now" starts
// a moment late and loses its first peak; this small lead keeps every note whole.
const LEAD = 0.01
// Where each pop sits between the speakers, in turn: the first one in the middle
// (so a single new person sounds centered), then spreading out to both sides.
const POP_PANS = [0, -0.35, 0.35, -0.6, 0.6]

// Notes of the C major pentatonic scale (C5 up to A6), in Hz. Any of them played one
// after another sounds pleasant, so the pops form a little rising melody.
const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760]

let enabled = readPreference()
let engine: Engine | null = null

function readPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false // storage blocked: sounds simply start off
  }
}

export function soundsEnabled(): boolean {
  return enabled
}

export function setSoundsEnabled(on: boolean): void {
  enabled = on
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // Storage blocked: the choice lasts until the page is reloaded.
  }
}

// ---------- Engine ----------

interface Engine {
  ctx: AudioContext
  /** Where every note connects; see the chain at the top of the file. */
  bus: AudioNode
}

function createEngine(): Engine {
  const ctx = new AudioContext()
  const bus = ctx.createGain()

  const reverb = ctx.createConvolver()
  reverb.buffer = roomEcho(ctx, REVERB_SECONDS)
  const reverbMix = ctx.createGain()
  reverbMix.gain.value = REVERB_MIX

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = BRIGHTNESS

  const volume = ctx.createGain()
  volume.gain.value = MASTER_VOLUME

  bus.connect(filter) // the note itself ("dry")
  bus.connect(reverb).connect(reverbMix).connect(filter) // its echo ("wet")
  filter.connect(volume).connect(ctx.destination)
  return { ctx, bus }
}

/**
 * A made-up room: stereo noise that fades out. A convolver "plays" every note through
 * it, which sounds like the note echoing in a space (reverb).
 */
function roomEcho(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3
  }
  return buffer
}

/** The audio engine, created on first use. `null` when sounds are off or unsupported. */
function audio(): Engine | null {
  if (!enabled || typeof AudioContext === 'undefined') return null
  engine ??= createEngine()
  if (engine.ctx.state === 'suspended') void engine.ctx.resume()
  return engine
}

// ---------- Notes ----------

interface Note {
  frequency: number
  /** Optional pitch at the very start, sliding to `frequency` in 30 ms (a "blip"). */
  from?: number
  /** Seconds from now until the note starts. */
  at: number
  /** Seconds to reach full volume, then seconds to fade out. */
  attack: number
  decay: number
  /** Loudness from 0 to 1. */
  gain: number
  wave: OscillatorType
  /** Position between the speakers: -1 left, 0 middle, 1 right. */
  pan: number
}

function playNote({ ctx, bus }: Engine, note: Note): void {
  const start = ctx.currentTime + LEAD + note.at
  const peak = start + note.attack
  const end = peak + note.decay

  const oscillator = ctx.createOscillator()
  oscillator.type = note.wave
  oscillator.frequency.setValueAtTime(note.from ?? note.frequency, start)
  if (note.from !== undefined) oscillator.frequency.exponentialRampToValueAtTime(note.frequency, start + 0.03)

  // Volume: from silence up to the peak (no click), then fading away.
  const volume = ctx.createGain()
  volume.gain.setValueAtTime(0.0001, start)
  volume.gain.exponentialRampToValueAtTime(note.gain, peak)
  volume.gain.exponentialRampToValueAtTime(0.0001, end)

  const panner = ctx.createStereoPanner()
  panner.pan.value = note.pan

  oscillator.connect(volume).connect(panner).connect(bus)
  oscillator.start(start)
  oscillator.stop(end + 0.05)
}

// ---------- The sounds ----------

/**
 * New people appeared: one soft bubble per person, climbing the pentatonic scale and
 * spreading a little between the left and right speakers.
 */
export function playPeopleAppear(count: number): void {
  const sound = audio()
  if (sound === null) return
  for (let index = 0; index < Math.min(count, MAX_POPS); index++) {
    const frequency = PENTATONIC[index % PENTATONIC.length]
    playNote(sound, {
      frequency,
      from: frequency * 0.75, // a quick upward slide is what makes it sound like a bubble
      at: index * POP_GAP,
      attack: 0.004,
      decay: 0.14,
      gain: 0.28,
      wave: 'sine',
      pan: POP_PANS[index % POP_PANS.length],
    })
  }
}

/** After an expansion: the bubbles for the new people, then a chime if a link became mutual. */
export function playExpansion(newPeople: number, newMutual: boolean): void {
  playPeopleAppear(newPeople)
  if (newMutual) playMutual(Math.min(newPeople, MAX_POPS) * POP_GAP + 0.05)
}

/**
 * A new mutual connection: a small bell struck twice, a fifth apart (A5 then E6), as
 * two people who follow each other. A bell is a main note plus quieter "overtones" at
 * uneven multiples, which fade faster.
 */
export function playMutual(delay = 0): void {
  const sound = audio()
  if (sound === null) return
  const strikes = [
    { frequency: 880, at: delay, pan: -0.2 },
    { frequency: 1318.51, at: delay + 0.09, pan: 0.2 },
  ]
  const overtones = [
    { ratio: 1, gain: 0.13, decay: 0.9 },
    { ratio: 2.76, gain: 0.045, decay: 0.45 },
    { ratio: 5.4, gain: 0.02, decay: 0.2 },
  ]
  for (const strike of strikes) {
    for (const overtone of overtones) {
      playNote(sound, {
        frequency: strike.frequency * overtone.ratio,
        at: strike.at,
        attack: 0.002,
        decay: overtone.decay,
        gain: overtone.gain,
        wave: 'sine',
        pan: strike.pan,
      })
    }
  }
}

/**
 * Logo orbit: a soft chord (A3 and E4) that swells during the turn. A filter opens and
 * closes like a breath, and the sound travels left → right → left with the people.
 */
export function playOrbit(seconds: number): void {
  const sound = audio()
  if (sound === null || seconds <= 0) return
  const { ctx, bus } = sound
  const start = ctx.currentTime + LEAD
  const end = start + seconds

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(400, start)
  filter.frequency.linearRampToValueAtTime(1800, start + seconds / 2)
  filter.frequency.linearRampToValueAtTime(400, end)

  const volume = ctx.createGain()
  volume.gain.setValueAtTime(0.0001, start)
  // Loudest halfway, when the sound passes through the middle: left and right stay even.
  volume.gain.exponentialRampToValueAtTime(0.08, start + seconds / 2)
  volume.gain.exponentialRampToValueAtTime(0.0001, end)

  // One full circle between the speakers during one full turn of the logo.
  const panner = ctx.createStereoPanner()
  const circle = new Float32Array(64).map((_, index) => Math.sin((index / 63) * 2 * Math.PI) * 0.7)
  panner.pan.setValueCurveAtTime(circle, start, seconds)

  filter.connect(volume).connect(panner).connect(bus)

  // Two slightly detuned waves per note make the chord sound warm instead of flat.
  for (const frequency of [220, 329.63]) {
    for (const detune of [-6, 6]) {
      const oscillator = ctx.createOscillator()
      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(frequency, start)
      oscillator.detune.value = detune // in cents (1/100 of a semitone)
      oscillator.connect(filter)
      oscillator.start(start)
      oscillator.stop(end + 0.05)
    }
  }
}

/** Something went wrong: two soft low notes going down (A3 then F#3), like "uh-oh". */
export function playError(): void {
  const sound = audio()
  if (sound === null) return
  for (const [index, frequency] of [220, 185].entries()) {
    const at = index * 0.13
    playNote(sound, { frequency, at, attack: 0.006, decay: 0.24, gain: 0.16, wave: 'triangle', pan: 0 })
    // The same note an octave lower, quieter, gives it body without making it harsh.
    playNote(sound, { frequency: frequency / 2, at, attack: 0.006, decay: 0.26, gain: 0.1, wave: 'sine', pan: 0 })
  }
}
