import './style.css'
import { SolarSystem } from './SolarSystem.js'

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
  $('#fly').addEventListener('click', (e) => {
    toggleFlying()
    e.currentTarget.blur() // so Space and the arrow keys go to the ship, not the button
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
      togglePause()
    } else if (e.key === 'Escape') {
      if (system.flying) system.stopFlying()
      else system.clearFocus()
    } else if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      toggleFlying()
    } else if (/^[0-8]$/.test(e.key)) {
      system.focusByIndex(Number(e.key))
    }
  })

  // The date only changes once per simulated day, so avoid needless DOM writes
  const dateEl = $('#date')
  const speedBar = $('#flight-speed')
  const boost = $('#flight-boost')
  const near = $('#flight-near')
  let shown = ''
  const updateHud = () => {
    const date = system.date
    const text = dateFormat.format(date)
    if (text !== shown) {
      dateEl.textContent = shown = text
      dateEl.dateTime = date.toISOString().slice(0, 10)
    }
    if (system.flying) {
      speedBar.style.width = `${Math.min(100, system.ship.speedShare * 100).toFixed(1)}%`
      boost.hidden = !system.ship.boosting
      const text = flightStatus(system)
      if (near.textContent !== text) near.textContent = text
    }
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
