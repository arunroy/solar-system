import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { Sun } from './objects/Sun.js'
import { Planet } from './objects/Planet.js'
import { AsteroidBelt } from './objects/AsteroidBelt.js'
import { createStars } from './objects/Stars.js'
import { sun as sunData, planets as planetData, asteroidBelt } from './data.js'

const J2000 = Date.UTC(2000, 0, 1, 12)
const DAY_MS = 86_400_000
const OVERVIEW_CAMERA = new THREE.Vector3(0, 60, 105)
const OVERVIEW_TARGET = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const daysSinceJ2000 = (date) => (date.getTime() - J2000) / DAY_MS

export class SolarSystem {
  constructor(container, { onSelect = () => {} } = {}) {
    this.container = container
    this.onSelect = onSelect

    this.days = daysSinceJ2000(new Date())
    this.speed = 10 // simulated days per real second
    this.paused = false
    this.elapsed = 0

    this.focus = null
    this.flight = null
    this.lastFocusPos = new THREE.Vector3()
    this.pointer = new THREE.Vector2()
    this.pointerInside = false
    this.hovered = null

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    container.append(this.renderer.domElement)

    this.labelRenderer = new CSS2DRenderer()
    this.labelRenderer.domElement.className = 'labels'
    container.append(this.labelRenderer.domElement)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 4000)
    this.camera.position.copy(OVERVIEW_CAMERA)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.minDistance = 2
    this.controls.maxDistance = 400

    // Only the asteroids use built-in lit materials; planets light themselves in their shaders
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.08))
    this.scene.add(new THREE.PointLight(0xfff1e0, 2.5, 0, 0))

    this.scene.add(createStars())
    this.sun = new Sun(sunData)
    this.scene.add(this.sun.group)

    this.planets = planetData.map((data) => new Planet(data))
    for (const planet of this.planets) this.scene.add(planet.group, planet.orbit)

    this.belt = new AsteroidBelt(asteroidBelt)
    this.scene.add(this.belt.mesh)

    this.bodies = [this.sun, ...this.planets]
    this.hitTargets = this.bodies.map((b) => b.hitTarget)
    for (const body of this.bodies) {
      body.label.element.addEventListener('click', () => this.focusOn(body))
    }

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.5, 0.82))
    this.composer.addPass(new OutputPass())

    this.raycaster = new THREE.Raycaster()
    this.clock = new THREE.Clock()

    this.bindEvents()
    this.resize()
    this.update(0) // place everything before the first frame
    this.renderer.setAnimationLoop(() => this.tick())
  }

  get date() {
    return new Date(J2000 + this.days * DAY_MS)
  }

  resetToToday() {
    this.days = daysSinceJ2000(new Date())
  }

  setOrbitsVisible(visible) {
    for (const planet of this.planets) planet.orbit.visible = visible
  }

  setLabelsVisible(visible) {
    this.labelRenderer.domElement.style.display = visible ? '' : 'none'
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize())
    const canvas = this.renderer.domElement

    canvas.addEventListener('pointermove', (e) => {
      this.setPointer(e)
      this.pointerInside = true
    })
    canvas.addEventListener('pointerleave', () => {
      this.pointerInside = false
    })
    // Treat a press-and-release without dragging as a click, so orbiting the camera never selects
    canvas.addEventListener('pointerdown', (e) => {
      this.downAt = { x: e.clientX, y: e.clientY }
    })
    canvas.addEventListener('pointerup', (e) => {
      if (!this.downAt) return
      const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y)
      this.downAt = null
      if (moved > 5) return
      this.setPointer(e)
      const body = this.pick()
      if (body) this.focusOn(body)
    })
  }

  setPointer(e) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
  }

  pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera)
    return this.raycaster.intersectObjects(this.hitTargets, false)[0]?.object.userData.body ?? null
  }

  resize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    const pixelRatio = Math.min(window.devicePixelRatio, 2)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.setSize(w, h)
    this.composer.setPixelRatio(pixelRatio)
    this.composer.setSize(w, h)
    this.labelRenderer.setSize(w, h)
  }

  /** Fly the camera smoothly; getTarget/getCamera are re-evaluated each frame so moving planets are tracked. */
  startFlight(getTarget, getCamera, duration = 1.8) {
    this.flight = {
      t: 0,
      duration,
      fromCamera: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      getTarget,
      getCamera,
    }
    this.controls.enabled = false
  }

  focusOn(body) {
    if (!body) return
    this.focus = body
    const distance = body.radius * (body === this.sun ? 3.2 : 5) + 1

    let direction
    if (body === this.sun) {
      direction = this.camera.position.clone().sub(this.controls.target).normalize()
    } else {
      // Approach from the Sun-facing side, a little off to the side and above, so the planet is lit
      const toSun = body.position.clone().negate().normalize()
      const side = new THREE.Vector3().crossVectors(UP, toSun).normalize()
      direction = toSun.multiplyScalar(0.6).add(side.multiplyScalar(0.7)).add(new THREE.Vector3(0, 0.3, 0)).normalize()
    }
    const offset = direction.multiplyScalar(distance)

    this.startFlight(
      () => body.position,
      (target) => target.clone().add(offset),
    )
    this.controls.minDistance = body.radius * 1.4
    for (const planet of this.planets) planet.orbit.material.opacity = planet === body ? 0.45 : 0.12
    this.onSelect(body)
  }

  clearFocus() {
    if (!this.focus) return
    this.focus = null
    this.controls.minDistance = 2
    for (const planet of this.planets) planet.orbit.material.opacity = 0.12
    this.startFlight(
      () => OVERVIEW_TARGET,
      () => OVERVIEW_CAMERA,
    )
    this.onSelect(null)
  }

  focusByIndex(index) {
    const body = this.bodies[index]
    if (body) this.focusOn(body)
  }

  update(dt) {
    const dtDays = this.paused ? 0 : this.speed * dt
    this.days += dtDays
    this.elapsed += dt

    this.sun.update(this.days, dtDays, dt, this.elapsed)
    for (const planet of this.planets) planet.update(this.days, dtDays, dt, this.elapsed)
    this.belt.update(this.days)
  }

  updateCamera(dt) {
    const flight = this.flight
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / flight.duration)
      const e = easeInOutCubic(flight.t)
      const target = flight.getTarget()
      this.controls.target.lerpVectors(flight.fromTarget, target, e)
      this.camera.position.lerpVectors(flight.fromCamera, flight.getCamera(target), e)
      if (flight.t === 1) {
        this.flight = null
        this.controls.enabled = true
        if (this.focus) this.lastFocusPos.copy(this.focus.position)
      }
    } else if (this.focus) {
      // Follow the focused body: shift camera and target by however far it moved this frame
      const delta = this.focus.position.clone().sub(this.lastFocusPos)
      this.camera.position.add(delta)
      this.controls.target.add(delta)
      this.lastFocusPos.copy(this.focus.position)
    }
    this.controls.update()
  }

  updateHover() {
    const hovered = this.pointerInside && !this.flight ? this.pick() : null
    if (hovered === this.hovered) return
    this.hovered?.label.element.classList.remove('is-hover')
    hovered?.label.element.classList.add('is-hover')
    this.renderer.domElement.style.cursor = hovered ? 'pointer' : ''
    this.hovered = hovered
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.1)
    this.update(dt)
    this.updateCamera(dt)
    this.updateHover()
    this.composer.render()
    this.labelRenderer.render(this.scene, this.camera)
  }
}
