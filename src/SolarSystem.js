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
import { Spaceship } from './objects/Spaceship.js'
import { createStars } from './objects/Stars.js'
import { textureManager } from './shaders/textures.js'
import { sun as sunData, planets as planetData, asteroidBelt } from './data.js'

const J2000 = Date.UTC(2000, 0, 1, 12)
const DAY_MS = 86_400_000
const OVERVIEW_CAMERA = new THREE.Vector3(0, 60, 105)
const OVERVIEW_TARGET = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)
const ORBITAL_PLANE = new THREE.Plane(UP, 0)
const CHASE_OFFSET = new THREE.Vector3(0, 0.09, 0.36) // camera behind and above the ship, in the ship's frame
const FOV = 45

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const daysSinceJ2000 = (date) => (date.getTime() - J2000) / DAY_MS

export class SolarSystem {
  constructor(container, { onSelect = () => {}, onFlyChange = () => {} } = {}) {
    this.container = container
    this.onSelect = onSelect
    this.onFlyChange = onFlyChange

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
    this.hoverPoint = new THREE.Vector3()
    this.flying = false
    this.chaseOffset = new THREE.Vector3()

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    container.append(this.renderer.domElement)

    this.labelRenderer = new CSS2DRenderer()
    this.labelRenderer.domElement.className = 'labels'
    container.append(this.labelRenderer.domElement)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 4000)
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
    // Resolves once the planet image textures have loaded (or failed — the manager still finishes)
    this.ready = new Promise((resolve) => {
      textureManager.onLoad = resolve
      textureManager.onError = (url) => console.warn(`Failed to load texture: ${url}`)
    })
    for (const planet of this.planets) this.scene.add(planet.group, planet.orbit)

    this.belt = new AsteroidBelt(asteroidBelt)
    this.scene.add(this.belt.mesh)

    this.ship = new Spaceship()
    this.scene.add(this.ship.group)

    this.bodies = [this.sun, ...this.planets] // the dock and keys 0–8
    this.moons = this.planets.flatMap((planet) => planet.moons)
    const clickable = [...this.bodies, ...this.moons]
    this.hitTargets = clickable.map((b) => b.hitTarget)
    this.planetMeshes = this.planets.map((planet) => planet.mesh)
    this.solidBodies = clickable // what the spaceship bounces off
    for (const body of clickable) {
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
      if (moved > 5 || this.flying) return
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
    const hits = this.raycaster.intersectObjects(this.hitTargets, false)
    // Planets' hit spheres are generous, which would hide a moon right beside its planet: prefer a moon
    // whenever its hit sphere is under the pointer and no planet's visible surface is in front of it
    const moonHit = hits.find((hit) => hit.object.userData.body.planet)
    if (moonHit) {
      const surface = this.raycaster.intersectObjects(this.planetMeshes, false)[0]
      if (!surface || surface.distance > moonHit.distance) return moonHit.object.userData.body
    }
    return hits[0]?.object.userData.body ?? null
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
    this.stopFlying()
    this.focus = body
    const distance = body.viewDistance ?? body.radius * (body === this.sun ? 3.2 : 5) + 1

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
    // Highlight the planet's orbit, and label the moons of the planet (or moon) in focus
    const system = body.planet ?? body
    for (const planet of this.planets) planet.orbit.material.opacity = planet === system ? 0.45 : 0.12
    for (const moon of this.moons) moon.label.visible = moon.planet === system
    this.onSelect(body)
  }

  clearFocus() {
    if (!this.focus) return
    this.focus = null
    this.controls.minDistance = 2
    for (const planet of this.planets) planet.orbit.material.opacity = 0.12
    for (const moon of this.moons) moon.label.visible = false
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

  /** Hand the camera to the spaceship, launched beside the body in focus (or Earth). */
  startFlying() {
    if (this.flying) return
    const near = this.focus ?? this.planets.find((planet) => planet.id === 'earth')
    const center = near.position.clone()
    // Start on the Sun-facing side, off to one side and a little above, looking at the body
    const toSun = near === this.sun ? new THREE.Vector3(0, 0, 1) : center.clone().negate().normalize()
    const side = new THREE.Vector3().crossVectors(UP, toSun).normalize()
    const direction = toSun.multiplyScalar(0.6).add(side.multiplyScalar(0.7)).add(new THREE.Vector3(0, 0.2, 0)).normalize()
    this.ship.launch(center.clone().addScaledVector(direction, near.radius * 3 + 0.6), center)

    this.focus = null
    this.flight = null
    for (const planet of this.planets) planet.orbit.material.opacity = 0.12
    for (const moon of this.moons) moon.label.visible = false
    this.onSelect(null)

    this.flying = true
    this.controls.enabled = false
    this.camera.near = 0.01 // the chase camera sits a fraction of a unit from the ship
    this.camera.updateProjectionMatrix()
    this.chaseOffset.copy(CHASE_OFFSET).applyQuaternion(this.ship.group.quaternion)
    this.updateChaseCamera(0)
    this.onFlyChange(true)
  }

  /** Back to the orbit camera, centred where the ship was. */
  stopFlying() {
    if (!this.flying) return
    this.flying = false
    this.ship.park()
    this.controls.target.copy(this.ship.position)
    this.controls.minDistance = 0.2
    this.controls.enabled = true
    this.camera.near = 0.05
    this.camera.fov = FOV
    this.camera.updateProjectionMatrix()
    this.onFlyChange(false)
  }

  /** The body whose surface is closest to the ship. */
  nearestBody() {
    let nearest = null
    let best = Infinity
    for (const body of this.solidBodies) {
      const gap = body.position.distanceTo(this.ship.position) - body.radius
      if (gap < best) [nearest, best] = [body, gap]
    }
    return nearest
  }

  updateChaseCamera(dt) {
    const ship = this.ship
    // Ease the camera's offset (not its position) toward its spot behind the ship, so it swings round
    // smoothly in turns without falling behind at speed; it pulls back a little as the ship speeds up
    const desired = CHASE_OFFSET.clone()
      .multiplyScalar(1 + ship.speedShare * 0.8)
      .applyQuaternion(ship.group.quaternion)
    this.chaseOffset.lerp(desired, 1 - Math.exp(-5 * dt))
    this.camera.position.copy(ship.position).add(this.chaseOffset)
    this.camera.lookAt(ship.position.clone().addScaledVector(ship.forward, 0.4))
    // Widen the view while boosting, for a sense of speed
    const fov = THREE.MathUtils.damp(this.camera.fov, FOV + (ship.boosting ? 12 : 0), 3, dt)
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
  }

  update(dt) {
    const dtDays = this.paused ? 0 : this.speed * dt
    this.days += dtDays
    this.elapsed += dt

    this.sun.update(this.days, dtDays, dt, this.elapsed)
    for (const planet of this.planets) planet.update(this.days, dtDays, dt, this.elapsed)
    this.belt.update(this.days, dt, this.elapsed)
    this.ship.update(dt, this.solidBodies)
  }

  updateCamera(dt) {
    if (this.flying) return this.updateChaseCamera(dt)
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
    // Rocks in the asteroid belt part around the cursor's point on the orbital plane
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const onPlane = this.pointerInside && this.raycaster.ray.intersectPlane(ORBITAL_PLANE, this.hoverPoint)
    this.belt.setHover(onPlane ? this.hoverPoint : null, this.camera.position.distanceTo(this.hoverPoint))

    const hovered = this.pointerInside && !this.flight && !this.flying ? this.pick() : null
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
