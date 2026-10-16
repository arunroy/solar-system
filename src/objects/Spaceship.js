import * as THREE from 'three'
import { getGlowTexture } from './helpers.js'

const SIZE = 0.1 // nose to tail, in scene units (Earth's radius is 1)
const HIT_RADIUS = SIZE * 0.5
const ACCELERATION = 4.5 // scene units/s² at full thrust
const BOOST = 8 // Shift multiplies thrust
// The engine only pushes the ship up to these speeds (relative to the planet it's near). There's no drag,
// so coasting keeps its speed and a gravity slingshot can take the ship faster still, up to MAX_SPEED.
const CRUISE_SPEED = 3
const BOOST_SPEED = 24
const MAX_SPEED = 40
const GRIP = 4 // while the engine fires, sideways drift dies away so the ship goes where it points
const HOLD_RATE = 3 // how quickly X's station-keeping thrusters bring the ship to a stop
const FRICTION = 4 // how quickly sliding along a surface stops, once landed
const TURN_RATE = 1.8 // rad/s
const PREDICT_STEPS = 300
const PREDICT_STEP = 1 / 25 // seconds, so the predicted path looks 12 s ahead
const MAX_PITCH = THREE.MathUtils.degToRad(80)
const MAX_BANK = THREE.MathUtils.degToRad(35)

// Keys by KeyboardEvent.code, so they work on any keyboard layout
const KEYS = {
  thrust: ['KeyW'],
  reverse: ['KeyS'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['ArrowDown'], // pull back to climb, as in a flight sim
  down: ['ArrowUp'],
  boost: ['ShiftLeft', 'ShiftRight'],
  hold: ['KeyX'],
}
const ALL_KEYS = new Set(Object.values(KEYS).flat())

const hull = new THREE.MeshStandardMaterial({ color: '#d9dde6', metalness: 0.3, roughness: 0.45 })
const trim = new THREE.MeshStandardMaterial({ color: '#c8483a', metalness: 0.2, roughness: 0.5 })
const glass = new THREE.MeshStandardMaterial({ color: '#1d2a44', metalness: 0.5, roughness: 0.15, emissive: '#16305c', emissiveIntensity: 0.6 })
const nozzle = new THREE.MeshStandardMaterial({ color: '#3a3d45', metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide })

/** A flat triangle (wing or fin) in the XZ plane, extruded to `thickness`. */
function blade(points, thickness) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)))
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false })
  geometry.rotateX(Math.PI / 2) // shape's XY → XZ
  geometry.translate(0, thickness / 2, 0)
  return geometry
}

/** The ship's model, one unit long, nose toward −Z. */
function createModel() {
  const model = new THREE.Group()

  // Cylinders run along +Y; turned onto Z their "top" faces the tail
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.55, 20), hull)
  body.rotation.x = Math.PI / 2
  model.add(body)

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 20), hull)
  nose.rotation.x = -Math.PI / 2
  nose.position.z = -0.475
  model.add(nose)

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 12), glass)
  cockpit.scale.set(0.9, 0.7, 1.8)
  cockpit.position.set(0, 0.075, -0.2)
  model.add(cockpit)

  const wings = new THREE.Mesh(blade([[-0.5, 0.25], [0, -0.2], [0.5, 0.25]], 0.02), hull)
  wings.position.set(0, -0.02, 0.02)
  model.add(wings)
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.2), trim)
    tip.position.set(side * 0.5, -0.02, 0.17)
    model.add(tip)
  }

  const fin = new THREE.Mesh(blade([[0, 0.28], [0, -0.02], [0.2, 0.28]], 0.02), trim)
  fin.rotation.z = Math.PI / 2 // stand it up
  fin.position.set(0, 0.06, 0)
  model.add(fin)

  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.08, 20, 1, true), nozzle)
  engine.rotation.x = Math.PI / 2
  engine.position.z = 0.31
  model.add(engine)

  return model
}

/** A line showing where the ship will coast, fading out toward its end. */
function createTrajectory() {
  const positions = new Float32Array(PREDICT_STEPS * 3)
  const colors = new Float32Array(PREDICT_STEPS * 3)
  const base = new THREE.Color('#7fc4ff')
  for (let i = 0; i < PREDICT_STEPS; i++) {
    const fade = (1 - i / PREDICT_STEPS) ** 1.5 * 0.7
    colors.set([base.r * fade, base.g * fade, base.b * fade], i * 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  // Additive, so fading the colour to black fades the line out
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  line.frustumCulled = false
  line.visible = false
  return line
}

/**
 * An arcade spaceship under gravity: W/S thrust, A/D (or ←/→) turn, ↑/↓ dive and climb, Shift boost,
 * X hold position. With the engine off it coasts, so it can fall into orbit or slingshot round a planet.
 * It bounces off the Sun, planets and moons, and can land on them.
 */
export class Spaceship {
  constructor() {
    this.group = new THREE.Group()
    this.group.visible = false
    this.model = createModel()
    this.model.scale.setScalar(SIZE)
    this.group.add(this.model)

    // Exhaust: bright enough to feed the bloom pass, and grows with thrust
    this.flame = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: new THREE.Color(0.55, 0.8, 1.6),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    this.flame.position.z = SIZE * 0.4
    this.group.add(this.flame)

    this.trajectory = createTrajectory()

    this.velocity = new THREE.Vector3() // relative to the frame: the planet whose pull the ship is in
    this.frame = null // a planet from Gravity, or null for the Sun's
    this.acceleration = new THREE.Vector3()
    this.yaw = 0
    this.pitch = 0
    this.bank = 0
    this.throttle = 0 // smoothed thrust, −1…1, drives the flame
    this.boosting = false
    this.holding = false
    this.landed = null // the body the ship is resting on
    this.status = 'falling' // 'orbit', 'falling', 'escaping', 'holding' or 'landed', for the HUD
    this.pressed = new Set()
    this.active = false

    window.addEventListener('keydown', (e) => {
      if (!this.active || !ALL_KEYS.has(e.code) || e.target.matches('input, textarea')) return
      e.preventDefault() // stop the arrows from scrolling or nudging the speed slider
      this.pressed.add(e.code)
    })
    window.addEventListener('keyup', (e) => this.pressed.delete(e.code))
    window.addEventListener('blur', () => this.pressed.clear())
  }

  get position() {
    return this.group.position
  }

  get forward() {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion)
  }

  /** Speed as a share of the top speed with boost, for the HUD. */
  get speedShare() {
    return this.velocity.length() / BOOST_SPEED
  }

  /** The body whose pull the ship is in: a planet, or the Sun. */
  get frameBody() {
    return this.frame?.body ?? null
  }

  /** Place the ship at `position`, at rest relative to whatever it's near, pointing at `target`. */
  launch(position, target, gravity) {
    this.group.position.copy(position)
    const to = target.clone().sub(position).normalize()
    this.yaw = Math.atan2(-to.x, -to.z)
    this.pitch = THREE.MathUtils.clamp(Math.asin(to.y), -MAX_PITCH, MAX_PITCH)
    this.bank = 0
    this.throttle = 0
    this.velocity.set(0, 0, 0)
    this.frame = gravity?.frameAt(position) ?? null
    this.landed = null
    this.pressed.clear()
    this.applyRotation()
    this.group.visible = true
    this.trajectory.visible = true
    this.active = true
  }

  park() {
    this.group.visible = false
    this.trajectory.visible = false
    this.active = false
    this.pressed.clear()
  }

  held(action) {
    return KEYS[action].some((code) => this.pressed.has(code))
  }

  applyRotation() {
    this.group.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
    this.model.rotation.z = this.bank
  }

  /**
   * Ride along with the planet whose pull the ship is in, and switch frames on crossing into or out of a
   * planet's sphere of influence, keeping the ship's true velocity.
   */
  updateFrame(gravity) {
    if (this.frame) this.group.position.add(this.frame.displacement)
    const frame = gravity.frameAt(this.group.position)
    if (frame === this.frame) return
    if (this.frame) this.velocity.add(this.frame.velocity)
    if (frame) this.velocity.sub(frame.velocity)
    this.frame = frame
  }

  /** `bodies`: anything with a `position` and `radius` the ship can't fly through. */
  update(dt, gravity, bodies) {
    if (!this.active) return
    this.updateFrame(gravity)

    const turn = (this.held('left') ? 1 : 0) - (this.held('right') ? 1 : 0)
    const climb = (this.held('up') ? 1 : 0) - (this.held('down') ? 1 : 0)
    const thrust = (this.held('thrust') ? 1 : 0) - (this.held('reverse') ? 0.5 : 0)
    this.boosting = this.held('boost') && thrust > 0
    this.holding = this.held('hold')

    this.yaw += turn * TURN_RATE * dt
    this.pitch = THREE.MathUtils.clamp(this.pitch + climb * TURN_RATE * 0.7 * dt, -MAX_PITCH, MAX_PITCH)
    // Lean into turns, purely for looks
    this.bank = THREE.MathUtils.damp(this.bank, turn * MAX_BANK, 5, dt)
    this.applyRotation()

    const v = this.velocity
    if (this.holding) {
      // Station-keeping thrusters cancel gravity and bring the ship to a stop
      v.multiplyScalar(Math.exp(-HOLD_RATE * dt))
    } else {
      v.addScaledVector(gravity.acceleration(this.group.position, this.frame, this.acceleration), dt)
    }

    if (thrust !== 0) {
      const forward = this.forward
      const ahead = v.dot(forward)
      const limit = this.boosting ? BOOST_SPEED : CRUISE_SPEED
      // The engine pushes only up to the speed limit, and never brakes a ship going faster
      if (thrust > 0 ? ahead < limit : ahead > -limit / 2) {
        v.addScaledVector(forward, thrust * ACCELERATION * (this.boosting ? BOOST : 1) * dt)
      }
      // Grip: sideways drift dies away while the engine fires
      const sideways = v.clone().addScaledVector(forward, -v.dot(forward))
      v.addScaledVector(sideways, Math.exp(-GRIP * dt) - 1)
    }
    if (v.length() > MAX_SPEED) v.setLength(MAX_SPEED)

    const from = this.group.position.clone()
    this.group.position.addScaledVector(v, dt)
    this.landed = null
    for (const body of bodies) {
      if (this.collide(body, from)) this.landed = body
    }
    if (this.landed && thrust <= 0) {
      // Resting on a surface: friction stops it sliding
      const normal = this.group.position.clone().sub(this.landed.position).normalize()
      const sliding = v.clone().addScaledVector(normal, -v.dot(normal))
      v.addScaledVector(sliding, Math.exp(-FRICTION * dt) - 1)
    }

    this.updateStatus(gravity)
    this.predict(gravity)

    this.throttle = THREE.MathUtils.damp(this.throttle, thrust * (this.boosting ? 2 : 1), 8, dt)
    const flame = Math.max(this.throttle, 0)
    this.flame.visible = flame > 0.02
    this.flame.scale.setScalar(SIZE * (0.25 + flame * 0.35) * (1 + Math.random() * 0.15))
    this.flame.material.opacity = Math.min(1, flame * 1.2)
  }

  updateStatus(gravity) {
    if (this.landed) this.status = 'landed'
    else if (this.holding) this.status = 'holding'
    else this.status = gravity.orbitAround(this.frame, this.group.position, this.velocity)
  }

  /** Coast forward under gravity alone (bodies held where they are now) to draw the path ahead. */
  predict(gravity) {
    const positions = this.trajectory.geometry.attributes.position
    const p = this.group.position.clone()
    const v = this.velocity.clone()
    const a = new THREE.Vector3()
    const solids = [gravity.sun, ...gravity.planets.flatMap((planet) => [planet, ...planet.moons])]
    let count = 0
    for (; count < PREDICT_STEPS; count++) {
      positions.setXYZ(count, p.x, p.y, p.z)
      if (solids.some((s) => s.position.distanceToSquared(p) < s.radius * s.radius)) break
      v.addScaledVector(gravity.acceleration(p, this.frame, a), PREDICT_STEP)
      p.addScaledVector(v, PREDICT_STEP)
    }
    positions.needsUpdate = true
    this.trajectory.geometry.setDrawRange(0, count)
    // Nothing to show while sitting still
    this.trajectory.visible = !this.landed && !this.holding
  }

  /**
   * Stops the ship at the surface of `body`, returning true if it touched. The whole path this frame
   * (`from` to the new position) is tested, not just where it ended up: at full boost the ship covers more
   * than a small moon's width in a frame and would otherwise skip straight through it.
   */
  collide(body, from) {
    const center = body.position
    const minDistance = body.radius + HIT_RADIUS
    const to = this.group.position
    const start = from.clone().sub(center)
    let hit
    if (start.lengthSq() < minDistance * minDistance * 1.0001) {
      hit = to.clone() // already touching, or a moving body ran into the ship: push out from where it is
      if (hit.distanceToSquared(center) >= minDistance * minDistance) return false
    } else {
      // First point where the segment from + t·(to − from), 0 ≤ t ≤ 1, enters the sphere
      const path = to.clone().sub(from)
      const a = path.lengthSq()
      const b = start.dot(path)
      const disc = b * b - a * (start.lengthSq() - minDistance * minDistance)
      if (a === 0 || disc < 0) return false
      const t = (-b - Math.sqrt(disc)) / a
      if (t < 0 || t > 1) return false
      hit = from.clone().addScaledVector(path, t)
    }
    const normal = hit.sub(center).normalize()
    if (normal.lengthSq() === 0) normal.set(0, 1, 0)
    to.copy(center).addScaledVector(normal, minDistance)
    // Cancel the inward motion, bouncing back a little off hard impacts (gentle ones just settle)
    const into = this.velocity.dot(normal)
    if (into < 0) this.velocity.addScaledVector(normal, -into * (into < -0.5 ? 1.4 : 1))
    return true
  }
}

