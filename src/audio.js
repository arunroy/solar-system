// Spaceship sound, synthesised with the Web Audio API (no audio files): a rumbling main engine, a roaring
// boost, hissing attitude thrusters and thuds on impact. Browsers only allow audio to start after a key
// press or click, so it is created on the first launch.

const MUTE_KEY = 'solar-system:muted'
const VOLUME = 0.6
const RAMP = 0.06 // seconds to glide to a new level, so changes never click

/** Two seconds of noise, white or brown (white integrated, so it's mostly low rumble). */
function noiseBuffer(ctx, brown) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1
    if (brown) {
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.5
    } else {
      data[i] = white
    }
  }
  return buffer
}

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export class ShipAudio {
  constructor() {
    this.ctx = null
    this.muted = readMuted()
    this.playing = false
    this.lastImpact = -Infinity
    document.addEventListener('visibilitychange', () => {
      // A hidden tab stops animating, which would leave the engine droning at its last level
      if (!this.ctx) return
      if (document.hidden) this.ctx.suspend()
      else if (this.playing) this.ctx.resume()
    })
  }

  /**
   * Build the graph: looping noise and tone sources, each behind its own filter and gain. `ctx` can be an
   * OfflineAudioContext, to render the sound without a sound device.
   */
  build(ctx = new AudioContext()) {
    this.ctx = ctx
    const compressor = ctx.createDynamicsCompressor()
    compressor.connect(ctx.destination)
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(compressor)

    const loop = (buffer) => {
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.loop = true
      // Start each at a random point so the loops don't line up into a pattern
      source.start(0, Math.random() * buffer.duration)
      return source
    }
    const chain = (source, filterType, frequency, q = 0.7) => {
      const filter = ctx.createBiquadFilter()
      filter.type = filterType
      filter.frequency.value = frequency
      filter.Q.value = q
      const gain = ctx.createGain()
      gain.gain.value = 0
      source.connect(filter).connect(gain).connect(this.master)
      return { filter, gain }
    }
    const brown = noiseBuffer(ctx, true)
    const white = noiseBuffer(ctx, false)
    this.whiteNoise = white

    // Main engine: brown-noise roar plus a low, slightly wavering hum
    this.engine = chain(loop(brown), 'lowpass', 200)
    const hum = ctx.createOscillator()
    hum.type = 'sawtooth'
    hum.frequency.value = 46
    const wobble = ctx.createOscillator()
    wobble.frequency.value = 5.5
    const wobbleDepth = ctx.createGain()
    wobbleDepth.gain.value = 2.5
    wobble.connect(wobbleDepth).connect(hum.frequency)
    hum.start()
    wobble.start()
    this.hum = chain(hum, 'lowpass', 140)
    this.humOscillator = hum

    // Boost: a brighter roar, band-passed white noise that rises with the burn
    this.boost = chain(loop(white), 'bandpass', 700, 0.9)
    // Station-keeping jets: high, thin hiss
    this.jets = chain(loop(white), 'highpass', 3500)
  }

  /** Begin playing (call from a key press or click, so the browser allows it). */
  start() {
    if (!this.ctx) this.build()
    this.ctx.resume()
    this.playing = true
    this.applyVolume()
  }

  /** Fade out and pause. */
  stop() {
    this.playing = false
    if (!this.ctx) return
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08)
    // Suspend once faded, unless flying started again in the meantime
    setTimeout(() => !this.playing && this.ctx.suspend(), 600)
  }

  setMuted(muted) {
    this.muted = muted
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      // Storage may be blocked; muting still works for this visit
    }
    this.applyVolume()
  }

  applyVolume() {
    if (!this.ctx) return
    this.master.gain.setTargetAtTime(this.playing && !this.muted ? VOLUME : 0, this.ctx.currentTime, 0.08)
  }

  /** Follow the ship's controls each frame. */
  update(ship) {
    if (!this.ctx || !this.playing) return
    const now = this.ctx.currentTime
    const level = Math.min(1, Math.abs(ship.throttle))
    const boost = ship.boosting ? Math.min(1, Math.max(0, ship.throttle - 1) * 1.5 + 0.3) : 0
    const set = (param, value) => param.setTargetAtTime(value, now, RAMP)

    // The roar opens up (brighter) as thrust builds
    set(this.engine.gain.gain, level * 0.55)
    set(this.engine.filter.frequency, 160 + level * 520 + boost * 400)
    set(this.hum.gain.gain, level * 0.18)
    set(this.humOscillator.frequency, 42 + level * 10 + boost * 14)
    set(this.boost.gain.gain, boost * 0.32)
    set(this.boost.filter.frequency, 600 + boost * 1400)
    // The attitude thrusters (turning, X, and S without flight assist) puff rather than hiss steadily
    const puff = ship.rcs > 0.05 ? (0.03 + 0.08 * Math.random()) * Math.min(1, ship.rcs * 1.5) : 0
    set(this.jets.gain.gain, puff)

    if (ship.impactSpeed > 0.3) this.impact(ship.impactSpeed)
  }

  /** A thud, louder and deeper for harder hits. */
  impact(speed) {
    const ctx = this.ctx
    const now = ctx.currentTime
    if (now - this.lastImpact < 0.15) return // resting contact or a scrape shouldn't machine-gun
    this.lastImpact = now
    const loudness = Math.min(1, speed / 6)

    const thump = ctx.createOscillator()
    thump.frequency.setValueAtTime(110 - loudness * 40, now)
    thump.frequency.exponentialRampToValueAtTime(35, now + 0.3)
    const thumpGain = ctx.createGain()
    thumpGain.gain.setValueAtTime(0.0001, now)
    thumpGain.gain.exponentialRampToValueAtTime(0.25 + loudness * 0.6, now + 0.01)
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35 + loudness * 0.3)
    thump.connect(thumpGain).connect(this.master)
    thump.start(now)
    thump.stop(now + 0.8)

    // A burst of crunch on top
    const crunch = ctx.createBufferSource()
    crunch.buffer = this.whiteNoise
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 600 + loudness * 1800
    const crunchGain = ctx.createGain()
    crunchGain.gain.setValueAtTime(0.0001, now)
    crunchGain.gain.exponentialRampToValueAtTime(0.1 + loudness * 0.35, now + 0.005)
    crunchGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12 + loudness * 0.25)
    crunch.connect(filter).connect(crunchGain).connect(this.master)
    crunch.start(now, Math.random())
    crunch.stop(now + 0.5)
  }
}
