// Soft interface sounds, made in the browser with the Web Audio API (no audio files).
//
// Each sound is one or more "tones": an oscillator (a wave at some frequency) whose
// volume rises quickly and fades out, which is what makes it sound like a short note.
//
// Sounds start off. The choice is remembered in localStorage for the next visit.
// They never carry information on their own: everything they mark is also on screen.
// Browsers only allow audio after the user clicks something on the page, so the
// audio engine is created on the first sound, which always follows a click.

const STORAGE_KEY = 'orbit:sounds'

// Sound tuning. Not design tokens: they shape the audio, not the look.
const VOLUME = 0.6 // overall volume, multiplies every tone below
const MAX_POPS = 12 // a big expansion plays at most this many pops
const POP_GAP = 0.035 // seconds between two pops

let enabled = readPreference()
let context: AudioContext | null = null

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

/** The audio engine, created on first use. `null` when sounds are off or unsupported. */
function audio(): AudioContext | null {
  if (!enabled || typeof AudioContext === 'undefined') return null
  context ??= new AudioContext()
  if (context.state === 'suspended') void context.resume()
  return context
}

interface Tone {
  /** Hz at the start, and optionally at the end (the pitch slides between them). */
  from: number
  to?: number
  /** Seconds after "now" when the tone starts, and how long it lasts. */
  delay: number
  duration: number
  /** Loudness from 0 to 1, before VOLUME. */
  gain: number
  wave: OscillatorType
}

function play(tones: Tone[]): void {
  const ctx = audio()
  if (ctx === null) return

  for (const tone of tones) {
    const start = ctx.currentTime + tone.delay
    const end = start + tone.duration

    const oscillator = ctx.createOscillator()
    oscillator.type = tone.wave
    oscillator.frequency.setValueAtTime(tone.from, start)
    if (tone.to !== undefined) oscillator.frequency.exponentialRampToValueAtTime(tone.to, end)

    // Volume: up in 5 ms (no click at the start), then fading out until the end.
    const volume = ctx.createGain()
    volume.gain.setValueAtTime(0.0001, start)
    volume.gain.exponentialRampToValueAtTime(tone.gain * VOLUME, start + 0.005)
    volume.gain.exponentialRampToValueAtTime(0.0001, end)

    oscillator.connect(volume).connect(ctx.destination)
    oscillator.start(start)
    oscillator.stop(end)
  }
}

// ---------- The sounds ----------

/** New people appeared: one small bubble "pop" each, a little different every time. */
export function playPeopleAppear(count: number): void {
  const pops = Math.min(count, MAX_POPS)
  const tones: Tone[] = []
  for (let index = 0; index < pops; index++) {
    const pitch = 520 + Math.random() * 260
    tones.push({ from: pitch, to: pitch * 1.6, delay: index * POP_GAP, duration: 0.07, gain: 0.08, wave: 'sine' })
  }
  play(tones)
}

/** After an expansion: the pops for the new people, then a ping if a link became mutual. */
export function playExpansion(newPeople: number, newMutual: boolean): void {
  playPeopleAppear(newPeople)
  if (newMutual) playMutual(Math.min(newPeople, MAX_POPS) * POP_GAP)
}

/** A new mutual connection: a short, bright "ping" (a note and a softer note above it). */
export function playMutual(delay = 0): void {
  play([
    { from: 1320, delay, duration: 0.25, gain: 0.07, wave: 'sine' },
    { from: 1980, delay, duration: 0.18, gain: 0.03, wave: 'sine' },
  ])
}

/**
 * Logo orbit: a soft hum that follows the turn. Unlike the other sounds it swells
 * instead of fading: the pitch goes up and back down, and the volume grows and
 * dies away with the movement.
 */
export function playOrbit(seconds: number): void {
  const ctx = audio()
  if (ctx === null || seconds <= 0) return
  const start = ctx.currentTime
  const end = start + seconds

  const oscillator = ctx.createOscillator()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(220, start)
  oscillator.frequency.linearRampToValueAtTime(330, start + seconds / 2)
  oscillator.frequency.linearRampToValueAtTime(220, end)

  const volume = ctx.createGain()
  volume.gain.setValueAtTime(0.0001, start)
  volume.gain.exponentialRampToValueAtTime(0.04 * VOLUME, start + seconds * 0.3)
  volume.gain.exponentialRampToValueAtTime(0.0001, end)

  oscillator.connect(volume).connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(end)
}

/** Something went wrong: a short low tone that drops a little. */
export function playError(): void {
  play([{ from: 196, to: 147, delay: 0, duration: 0.28, gain: 0.08, wave: 'triangle' }])
}
