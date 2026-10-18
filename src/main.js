import './style.css'
import { SolarSystem } from './SolarSystem.js'
import { RACK, DIFFICULTIES } from './game.js'

const $ = (selector) => document.querySelector(selector)

function el(tag, text) {
  const node = document.createElement(tag)
  node.textContent = text
  return node
}

const dateFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
const dockButtons = new Map()

function showInfo(body) {
  for (const [id, button] of dockButtons) button.classList.toggle('is-active', body?.id === id)
  const info = $('#info')
  if (!body) {
    info.hidden = true
    return
  }
  const { data } = body
  $('#info-kind').textContent = data.kind
  $('#info-name').textContent = data.name
  $('#info-desc').textContent = data.description
  $('#info-facts').replaceChildren(...data.facts.flatMap(([label, value]) => [el('dt', label), el('dd', value)]))
  info.hidden = false
}

let speedBeforeFlight = null

function showFlight(flying) {
  const fly = $('#fly')
  fly.setAttribute('aria-pressed', String(flying))
  fly.textContent = flying ? 'Exit ship' : 'Fly'
  $('#flight').hidden = !flying
  // Slow time right down while flying, so the planets don't race past the ship, and restore it afterwards
  // unless the speed was changed in flight
  const speed = $('#speed')
  if (flying) {
    speedBeforeFlight = speed.value
    speed.value = 0
  } else if (speedBeforeFlight !== null && speed.value === '0') {
    speed.value = speedBeforeFlight
  }
  speed.dispatchEvent(new Event('input'))
}

const nameOf = (body) => (body.id === 'sun' ? 'the Sun' : body.data.name)

/** What the ship is doing, relative to the body whose gravity holds it. */
function flightStatus(system) {
  const { ship } = system
  const frame = ship.frameBody ?? system.sun
  switch (ship.status) {
    case 'landed':
      return `Landed on ${nameOf(ship.landed)}`
    case 'holding':
      return `Holding position near ${nameOf(system.nearestBody())}`
    case 'orbit':
      return `In orbit round ${nameOf(frame)}`
    case 'falling':
      return `Falling toward ${nameOf(frame)}`
    default:
      return `Escaping ${nameOf(frame)}`
  }
}

const SUN_RADIUS_KM = 696_000
const radiusKmOf = (body) => body.data.radiusKm ?? SUN_RADIUS_KM

function formatDistance(km) {
  if (km >= 1e6) return `${(km / 1e6).toFixed(km >= 1e7 ? 0 : 1)} million km`
  if (km >= 100) return `${Math.round(km).toLocaleString('en')} km`
  return `${km.toFixed(1)} km`
}

function formatDuration(seconds) {
  if (seconds < 7200) return `${Math.round(seconds / 60)} min`
  if (seconds < 172_800) return `${(seconds / 3600).toFixed(1)} h`
  return `${(seconds / 86_400).toFixed(1)} days`
}

/**
 * The flight instruments. Sizes and distances in the scene are compressed, so heights are given in the
 * body's real kilometres at the same height in body radii, and speeds as the real speed of the same orbit
 * (see Gravity.realSpeed): a low circular orbit of Earth reads about 7.8 km/s and 90 minutes, as it should.
 */
function flightReadouts(system) {
  const { ship, gravity } = system
  const ref = ship.frameBody ?? system.sun
  const kms = gravity.realSpeed(ship.frame, ship.velocity.length())
  const speed = kms < 1 ? `${Math.round(kms * 1000)} m/s` : `${kms.toFixed(kms >= 10 ? 1 : 2)} km/s`

  const near = system.nearestBody()
  const gap = Math.max(0, near.position.distanceTo(ship.position) - near.radius - ship.hitRadius)
  const readouts = {
    speed: `${speed} relative to ${nameOf(ref)}`,
    altitude: `${formatDistance((gap / near.radius) * radiusKmOf(near))} above ${nameOf(near)}`,
    periapsis: '—',
    apoapsis: '—',
    period: '—',
  }
  // The orbit round the planet whose pull the ship is in (round the Sun, distances aren't to any one scale)
  const { orbit } = ship
  if (ship.frame && orbit) {
    const R = ref.radius
    const km = radiusKmOf(ref)
    // Heights of the hull above the surface, as for the altitude, so "below the surface" means a landing
    const surface = R + ship.hitRadius
    const height = (r) => formatDistance(Math.max(0, ((r - surface) / R) * km))
    readouts.periapsis = orbit.periapsis < surface ? 'below the surface' : height(orbit.periapsis)
    if (orbit.apoapsis === Infinity) readouts.apoapsis = `escapes ${nameOf(ref)}`
    else if (orbit.apoapsis > ship.frame.soi) readouts.apoapsis = `${height(orbit.apoapsis)}, beyond its pull`
    else readouts.apoapsis = height(orbit.apoapsis)
    if (orbit.status === 'orbit') {
      // Kepler's third law for the same orbit, in body radii, round the real body
      const seconds = 2 * Math.PI * Math.sqrt(((orbit.a / R) ** 3 * km * 1000) / ref.data.gravity)
      readouts.period = formatDuration(seconds)
    }
  }
  return readouts
}

const EDGE = 30 // px: off-screen markers sit this far in from the edge of the screen

/** Where to mark a point in the scene: on it if it's in view, otherwise at the screen edge in its direction. */
function markerSpot(system, point) {
  const p = system.screenPoint(point)
  if (p.onScreen) return { ...p, angle: 0 }
  const canvas = system.renderer.domElement
  const cx = canvas.clientWidth / 2
  const cy = canvas.clientHeight / 2
  let dx = p.x - cx
  let dy = p.y - cy
  if (Math.abs(dx) + Math.abs(dy) < 1e-3) dy = 1 // dead behind: point down
  const scale = Math.min((cx - EDGE) / Math.max(Math.abs(dx), 1e-6), (cy - EDGE) / Math.max(Math.abs(dy), 1e-6))
  return { x: cx + dx * scale, y: cy + dy * scale, onScreen: false, angle: Math.atan2(dy, dx) }
}

/** The game's HUD: score and meters, invader markers, the missile lock, messages and the hit flash. */
function gameHud(system) {
  const { game } = system
  const panel = $('#game')
  const overlay = $('#game-overlay')
  const messageEl = $('#game-message')
  const title = $('#game-title')
  const text = $('#game-text')
  const play = $('#play')
  const damage = $('#damage')
  const keys = $('.flight__game-keys')
  const difficulty = $('#difficulty')
  const stats = Object.fromEntries(['level', 'wave', 'score', 'best', 'lives', 'left'].map((key) => [key, $(`#game-${key}`)]))
  const hull = $('#game-hull')
  const defences = $('#game-defences')
  const targetName = $('#game-target')
  const pips = Array.from({ length: RACK }, () => $('#game-missiles').appendChild(el('span', '')))
  const lock = $('#game-lock')
  const objective = $('#game-objective')
  const objectiveArrow = objective.appendChild(el('span', ''))
  objectiveArrow.className = 'objective__arrow'
  const objectiveName = objective.appendChild(el('span', ''))
  const markers = []

  const setText = (node, value) => {
    if (node.textContent !== value) node.textContent = value
  }
  const moveTo = (node, spot, rotate = true) => {
    node.style.transform = `translate(${spot.x.toFixed(1)}px, ${spot.y.toFixed(1)}px)${rotate ? ` rotate(${spot.angle.toFixed(3)}rad)` : ''}`
  }

  return () => {
    const showing = game.active && system.flying
    panel.hidden = !showing
    overlay.hidden = !showing
    keys.hidden = !game.active
    setText(play, !game.active ? 'Defend' : game.over ? 'Play again' : 'Quit game')
    play.setAttribute('aria-pressed', String(game.active))
    // The choice is for the next game, so it's locked while one is being played
    setText(difficulty, DIFFICULTIES[game.difficulty].name)
    difficulty.disabled = !game.canChangeDifficulty
    const message = showing ? game.message : null
    messageEl.hidden = !message
    if (message) {
      setText(title, message.title)
      setText(text, message.text)
    }
    damage.style.opacity = showing ? Math.max(0, 1 - (game.time - game.hurtAt) / 0.6).toFixed(2) : '0'
    if (!showing) return

    setText(stats.level, game.level.name)
    setText(stats.wave, String(game.wave))
    setText(stats.score, game.score.toLocaleString('en'))
    setText(stats.best, Math.max(game.highScore, game.score).toLocaleString('en'))
    setText(stats.lives, String(game.lives))
    setText(stats.left, String(game.invadersLeft))
    hull.style.width = `${Math.max(0, game.hull).toFixed(1)}%`
    hull.classList.toggle('is-low', game.hull < 30)
    setText(targetName, game.target?.data.name ?? '—')
    defences.style.width = `${game.defences.toFixed(1)}%`
    defences.classList.toggle('is-low', game.defences < 30)
    pips.forEach((pip, i) => pip.classList.toggle('is-empty', i >= game.rack))

    // A marker on each invader, or at the edge of the screen pointing the way to it
    game.invaders.forEach((invader, i) => {
      const marker = markers[i] ?? (markers[i] = overlay.appendChild(el('span', '')))
      const spot = markerSpot(system, invader.position)
      marker.hidden = false
      marker.className = `enemy enemy--${invader.kind}${spot.onScreen ? '' : ' is-off'}`
      moveTo(marker, spot)
    })
    for (let i = game.invaders.length; i < markers.length; i++) markers[i].hidden = true

    // The planet under attack, when it's out of view
    const target = game.target && markerSpot(system, game.target.position)
    objective.hidden = !target || target.onScreen
    if (!objective.hidden) {
      moveTo(objective, target, false)
      objectiveArrow.style.transform = `rotate(${target.angle.toFixed(3)}rad)`
      setText(objectiveName, game.target.data.name)
    }

    // Brackets round the invader the nose is on, closing in as the lock builds
    const locked = game.lock.invader
    const spot = locked && system.ship.active ? system.screenPoint(locked.position) : null
    lock.hidden = !spot?.onScreen
    if (!lock.hidden) {
      lock.style.transform = `translate(${spot.x.toFixed(1)}px, ${spot.y.toFixed(1)}px) scale(${(2 - game.lock.progress).toFixed(2)})`
      lock.classList.toggle('is-locked', game.lock.locked)
    }
  }
}

function formatSpeed(daysPerSecond) {
  if (daysPerSecond >= 365) return `${(daysPerSecond / 365.25).toFixed(daysPerSecond >= 3652 ? 0 : 1)} yr/s`
  if (daysPerSecond >= 1) return `${daysPerSecond.toFixed(daysPerSecond >= 10 ? 0 : 1)} days/s`
  return `${(daysPerSecond * 24).toFixed(1)} h/s`
}

function setupControls(system) {
  const pause = $('#pause')
  const togglePause = () => {
    system.paused = !system.paused
    pause.textContent = system.paused ? '▶' : '❚❚'
    pause.setAttribute('aria-label', system.paused ? 'Play' : 'Pause')
  }
  pause.addEventListener('click', togglePause)

  // Slider is logarithmic: 0 → 0.1 days/s, 50 → 10 days/s, 100 → 1000 days/s
  const speed = $('#speed')
  const applySpeed = () => {
    system.speed = 10 ** ((Number(speed.value) - 25) / 25)
    $('#speed-value').textContent = formatSpeed(system.speed)
  }
  speed.addEventListener('input', applySpeed)
  applySpeed()

  $('#today').addEventListener('click', () => system.resetToToday())
  $('#toggle-orbits').addEventListener('change', (e) => system.setOrbitsVisible(e.target.checked))
  $('#toggle-labels').addEventListener('change', (e) => system.setLabelsVisible(e.target.checked))
  $('#info-close').addEventListener('click', () => system.clearFocus())
  const toggleFlying = () => (system.flying ? system.stopFlying() : system.startFlying())
  const sound = $('#flight-sound')
  const showSound = () => {
    const on = !system.shipAudio.muted
    sound.setAttribute('aria-pressed', String(on))
    sound.textContent = on ? 'Sound on' : 'Sound off'
  }
  const toggleSound = () => {
    system.shipAudio.setMuted(!system.shipAudio.muted)
    showSound()
  }
  showSound()
  sound.addEventListener('click', (e) => {
    toggleSound()
    e.currentTarget.blur()
  })
  const assist = $('#flight-assist')
  // Also called from the HUD loop, as the game switches assist on by itself
  const showAssist = () => {
    const text = system.ship.assist ? 'Assist on' : 'Assist off'
    if (assist.textContent === text) return
    assist.setAttribute('aria-pressed', String(system.ship.assist))
    assist.textContent = text
  }
  const toggleAssist = () => {
    system.ship.setAssist(!system.ship.assist)
    showAssist()
  }
  showAssist()
  assist.addEventListener('click', (e) => {
    toggleAssist()
    e.currentTarget.blur()
  })
  $('#fly').addEventListener('click', (e) => {
    toggleFlying()
    e.currentTarget.blur() // so Space and the arrow keys go to the ship, not the button
  })
  // G starts a game, quits one in progress, or after game over plays again
  const { game } = system
  const toggleGame = () => (game.active && !game.over ? system.stopFlying() : game.start())
  $('#play').addEventListener('click', (e) => {
    toggleGame()
    e.currentTarget.blur()
  })
  // L (or the button) steps through the difficulties, between games
  $('#difficulty').addEventListener('click', (e) => {
    game.cycleDifficulty()
    e.currentTarget.blur()
  })

  const dock = $('#dock')
  system.bodies.forEach((body, i) => {
    const button = el('button', body.data.name)
    button.type = 'button'
    button.title = `${body.data.name} (${i})`
    button.style.setProperty('--c', body.data.color)
    button.addEventListener('click', () => system.focusOn(body))
    dockButtons.set(body.id, button)
    dock.append(button)
  })

  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return
    if (e.code === 'Space') {
      e.preventDefault()
      if (!game.active) togglePause() // in the game, Space fires
    } else if (e.key === 'Escape') {
      if (system.flying) system.stopFlying()
      else system.clearFocus()
    } else if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      toggleFlying()
    } else if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      toggleSound()
    } else if (e.code === 'KeyZ' && system.flying && !e.ctrlKey && !e.metaKey && !e.altKey) {
      toggleAssist()
    } else if (e.code === 'KeyG' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      toggleGame()
    } else if (e.code === 'KeyL' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      game.cycleDifficulty()
    } else if (/^[0-8]$/.test(e.key) && !game.active) {
      system.focusByIndex(Number(e.key))
    }
  })

  // The date only changes once per simulated day, so avoid needless DOM writes
  const dateEl = $('#date')
  const throttleBar = $('#flight-throttle')
  const boost = $('#flight-boost')
  const near = $('#flight-near')
  const readoutEls = Object.fromEntries(
    ['speed', 'altitude', 'periapsis', 'apoapsis', 'period'].map((key) => [key, $(`#flight-${key}`)]),
  )
  const markers = $('#flight-markers')
  const nose = $('#marker-nose')
  const prograde = $('#marker-prograde')
  const retrograde = $('#marker-retrograde')
  const place = (marker, direction) => {
    const point = direction && system.screenDirection(direction)
    marker.hidden = !point
    if (point) marker.style.transform = `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px)`
  }
  const updateGameHud = gameHud(system)
  let shown = ''
  const updateHud = () => {
    const date = system.date
    const text = dateFormat.format(date)
    if (text !== shown) {
      dateEl.textContent = shown = text
      dateEl.dateTime = date.toISOString().slice(0, 10)
    }
    markers.hidden = !system.flying
    if (system.flying) {
      const { ship } = system
      throttleBar.style.width = `${Math.min(100, Math.abs(ship.throttle) * 100).toFixed(1)}%`
      boost.hidden = !ship.boosting
      const text = flightStatus(system)
      if (near.textContent !== text) near.textContent = text
      for (const [key, value] of Object.entries(flightReadouts(system))) {
        if (readoutEls[key].textContent !== value) readoutEls[key].textContent = value
      }
      const moving = !ship.landed && ship.velocity.lengthSq() > 1e-4
      place(nose, ship.forward)
      place(prograde, moving ? ship.velocity.clone().normalize() : null)
      place(retrograde, moving ? ship.velocity.clone().normalize().negate() : null)
      showAssist()
    }
    updateGameHud()
    requestAnimationFrame(updateHud)
  }
  updateHud()
}

const hideLoader = () => $('#loader').classList.add('is-hidden')

try {
  const system = new SolarSystem($('#scene'), { onSelect: showInfo, onFlyChange: showFlight })
  setupControls(system)
  // Wait for the planet textures, but never keep the loader up for more than a few seconds
  Promise.race([system.ready, new Promise((resolve) => setTimeout(resolve, 8000))]).then(hideLoader)
} catch (err) {
  console.error(err)
  $('#scene').append(el('p', 'This demo needs WebGL, which is not available in this browser.'))
  $('#scene').classList.add('is-error')
  hideLoader()
}
