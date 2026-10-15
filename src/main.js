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
      system.clearFocus()
    } else if (/^[0-8]$/.test(e.key)) {
      system.focusByIndex(Number(e.key))
    }
  })

  // The date only changes once per simulated day, so avoid needless DOM writes
  const dateEl = $('#date')
  let shown = ''
  const updateDate = () => {
    const date = system.date
    const text = dateFormat.format(date)
    if (text !== shown) {
      dateEl.textContent = shown = text
      dateEl.dateTime = date.toISOString().slice(0, 10)
    }
    requestAnimationFrame(updateDate)
  }
  updateDate()
}

try {
  const system = new SolarSystem($('#scene'), { onSelect: showInfo })
  setupControls(system)
} catch (err) {
  console.error(err)
  $('#scene').append(el('p', 'This demo needs WebGL, which is not available in this browser.'))
  $('#scene').classList.add('is-error')
} finally {
  requestAnimationFrame(() => $('#loader').classList.add('is-hidden'))
}
