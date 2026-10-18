import * as THREE from 'three'
import { getGlowTexture } from './helpers.js'

const SPARKS = 3000 // particles shared by every explosion and missile trail
const tmp = new THREE.Vector3()
const tmpDirection = new THREE.Vector3()
const NOSE = new THREE.Vector3(0, 0, -1)

/**
 * Whether the path from `from` to `to` passes within `radius` of `center`. Missiles and bolts move further
 * than a ship's width in a frame, so testing only where they end up would let them pass straight through.
 */
export function segmentHits(from, to, center, radius) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const a = dx * dx + dy * dy + dz * dz
  const fx = from.x - center.x
  const fy = from.y - center.y
  const fz = from.z - center.z
  const t = a > 0 ? Math.min(1, Math.max(0, -(fx * dx + fy * dy + fz * dz) / a)) : 0
  const cx = fx + dx * t
  const cy = fy + dy * t
  const cz = fz + dz * t
  return cx * cx + cy * cy + cz * cz <= radius * radius
}

/**
 * Explosions, flashes and exhaust trails: a pool of glow sprites that swell and fade, and one cloud of
 * additive particles reused as a ring buffer, so nothing is allocated while fighting.
 */
export class Effects {
  constructor() {
    this.group = new THREE.Group()
    this.glow = getGlowTexture()
    this.flashes = []

    const geometry = new THREE.BufferGeometry()
    this.positions = new Float32Array(SPARKS * 3)
    this.colors = new Float32Array(SPARKS * 3)
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage))
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage))
    this.sparks = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.03,
        map: this.glow,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    this.sparks.frustumCulled = false
    this.group.add(this.sparks)
    this.velocities = new Float32Array(SPARKS * 3)
    this.base = new Float32Array(SPARKS * 3) // each particle's colour at birth
    this.life = new Float32Array(SPARKS)
    this.maxLife = new Float32Array(SPARKS).fill(1)
    this.next = 0
  }

  /** One particle, fading out over `life` seconds. */
  spark(position, velocity, color, life) {
    const i = this.next
    this.next = (i + 1) % SPARKS
    this.positions.set([position.x, position.y, position.z], i * 3)
    this.velocities.set([velocity.x, velocity.y, velocity.z], i * 3)
    this.base.set([color.r, color.g, color.b], i * 3)
    this.life[i] = this.maxLife[i] = life
  }

  /** `count` particles flung out in random directions at up to `speed`, carried along at `drift`. */
  burst(position, count, speed, color, life, drift) {
    const v = new THREE.Vector3()
    for (let i = 0; i < count; i++) {
      v.randomDirection().multiplyScalar(speed * (0.2 + Math.random() * 0.8))
      if (drift) v.add(drift)
      this.spark(position, v, color, life * (0.5 + Math.random() * 0.5))
    }
  }

  /** A glow that swells to `size` and fades over `duration` seconds. */
  flash(position, size, color, duration = 0.5) {
    let flash = this.flashes.find((f) => f.t >= 1)
    if (!flash) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      )
      this.group.add(sprite)
      flash = { sprite, t: 1 }
      this.flashes.push(flash)
    }
    flash.sprite.position.copy(position)
    flash.sprite.material.color.copy(color)
    flash.sprite.visible = true
    Object.assign(flash, { t: 0, size, duration })
    this.updateFlash(flash, 0)
  }

  /** A fireball: a white-hot core, an orange glow, and burning debris. `size` 1 is a small ship. */
  explosion(position, size = 1, drift) {
    this.flash(position, 0.35 * size, new THREE.Color(3, 2.6, 2.2), 0.25)
    this.flash(position, 0.8 * size, new THREE.Color(2.2, 0.9, 0.3), 0.7 + size * 0.15)
    this.burst(position, Math.round(60 * size), 1.4 * size, new THREE.Color(2.4, 1.1, 0.35), 1.1, drift)
    this.burst(position, Math.round(25 * size), 0.5 * size, new THREE.Color(0.5, 0.45, 0.42), 1.8, drift)
  }

  updateFlash(flash, dt) {
    flash.t = Math.min(1, flash.t + dt / flash.duration)
    const swell = 1 - (1 - flash.t) ** 3
    flash.sprite.scale.setScalar(flash.size * (0.3 + 0.7 * swell))
    flash.sprite.material.opacity = (1 - flash.t) ** 2
    if (flash.t >= 1) flash.sprite.visible = false
  }

  update(dt) {
    for (const flash of this.flashes) if (flash.t < 1) this.updateFlash(flash, dt)
    const drag = Math.exp(-1.2 * dt) // debris slows as it spreads, so explosions read as bursts, not streaks
    const { positions, velocities, colors, base, life, maxLife } = this
    for (let i = 0; i < SPARKS; i++) {
      if (life[i] <= 0) continue
      life[i] = Math.max(0, life[i] - dt)
      const k = i * 3
      velocities[k] *= drag
      velocities[k + 1] *= drag
      velocities[k + 2] *= drag
      positions[k] += velocities[k] * dt
      positions[k + 1] += velocities[k + 1] * dt
      positions[k + 2] += velocities[k + 2] * dt
      const fade = (life[i] / maxLife[i]) ** 1.5
      colors[k] = base[k] * fade
      colors[k + 1] = base[k + 1] * fade
      colors[k + 2] = base[k + 2] * fade
    }
    this.sparks.geometry.attributes.position.needsUpdate = true
    this.sparks.geometry.attributes.color.needsUpdate = true
  }

  clear() {
    this.life.fill(0)
    this.colors.fill(0)
    this.sparks.geometry.attributes.color.needsUpdate = true
    for (const flash of this.flashes) {
      flash.t = 1
      flash.sprite.visible = false
    }
  }
}

let missileParts
function createMissileModel() {
  missileParts ??= {
    body: new THREE.CylinderGeometry(0.0045, 0.0045, 0.04, 8).rotateX(Math.PI / 2),
    nose: new THREE.ConeGeometry(0.0045, 0.012, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.026),
    fins: new THREE.BoxGeometry(0.018, 0.0015, 0.008).translate(0, 0, 0.016),
    white: new THREE.MeshStandardMaterial({ color: '#e8e8ea', metalness: 0.3, roughness: 0.45 }),
    red: new THREE.MeshStandardMaterial({ color: '#b3261e', metalness: 0.3, roughness: 0.5 }),
    exhaust: new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: new THREE.Color(2.2, 1.4, 0.7),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  }
  const p = missileParts
  const model = new THREE.Group()
  model.add(new THREE.Mesh(p.body, p.white), new THREE.Mesh(p.nose, p.red))
  const fins = new THREE.Mesh(p.fins, p.white)
  const fins2 = fins.clone()
  fins2.rotation.z = Math.PI / 2
  model.add(fins, fins2)
  const exhaust = new THREE.Sprite(p.exhaust)
  exhaust.position.z = 0.03
  exhaust.scale.setScalar(0.035)
  model.add(exhaust)
  return model
}

const MISSILE_THRUST = 16 // units/s²
const MISSILE_DELTA_V = 18 // the most it speeds up beyond its launch speed
const MISSILE_TURN = 4.5 // rad/s
const MISSILE_DIVERT = 3 // how quickly its side thrusters kill sideways drift
const MISSILE_LIFE = 6 // seconds before it self-destructs
const TRAIL_COLOR = new THREE.Color(0.55, 0.5, 0.45)

/**
 * A homing missile. It burns hard along its heading and swings that heading toward the point where its
 * target will be (pursuit with lead), with side thrusters cancelling its sideways drift, so it curves in
 * rather than orbiting its prey. Without a target it flies straight.
 */
export class Missile {
  constructor(position, direction, velocity, target) {
    this.group = createMissileModel()
    this.group.position.copy(position)
    this.heading = direction.clone().normalize()
    this.velocity = velocity.clone()
    this.maxSpeed = velocity.length() + MISSILE_DELTA_V
    this.target = target
    this.life = MISSILE_LIFE
    this.previous = position.clone()
    this.alive = true
    this.group.quaternion.setFromUnitVectors(NOSE, this.heading)
  }

  get position() {
    return this.group.position
  }

  update(dt, effects) {
    this.life -= dt
    this.previous.copy(this.group.position)
    const target = this.target?.alive ? this.target : null
    if (target) {
      // Aim where the target will be when the missile arrives
      const rel = tmp.subVectors(target.position, this.group.position)
      const closing = Math.max(1, this.velocity.length())
      const want = tmpDirection.copy(rel).addScaledVector(target.worldVelocity, rel.length() / closing).normalize()
      const angle = this.heading.angleTo(want)
      if (angle > 1e-4) {
        const axis = new THREE.Vector3().crossVectors(this.heading, want).normalize()
        if (axis.lengthSq() > 0) this.heading.applyAxisAngle(axis, Math.min(angle, MISSILE_TURN * dt)).normalize()
      }
    }
    this.velocity.addScaledVector(this.heading, MISSILE_THRUST * dt)
    const along = this.velocity.dot(this.heading)
    const sideways = tmp.copy(this.velocity).addScaledVector(this.heading, -along)
    this.velocity.addScaledVector(sideways, Math.exp(-MISSILE_DIVERT * dt) - 1)
    if (this.velocity.length() > this.maxSpeed) this.velocity.setLength(this.maxSpeed)
    this.group.position.addScaledVector(this.velocity, dt)
    this.group.quaternion.setFromUnitVectors(NOSE, this.heading)

    // A smoke trail, left behind where the exhaust was
    const tail = tmp.copy(this.group.position).addScaledVector(this.heading, -0.03)
    effects.spark(tail, tmpDirection.randomDirection().multiplyScalar(0.03), TRAIL_COLOR, 0.7)
  }
}

let boltParts
const BOLT_LIFE = 3

/** An invader's plasma bolt: a short red streak with a glow, flying straight. */
export class Bolt {
  constructor(position, velocity) {
    boltParts ??= {
      core: new THREE.CylinderGeometry(0.005, 0.005, 0.1, 6).rotateX(Math.PI / 2),
      material: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.5, 0.35) }),
      glow: new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: new THREE.Color(1.8, 0.15, 0.1),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    }
    this.group = new THREE.Group()
    this.group.add(new THREE.Mesh(boltParts.core, boltParts.material))
    const glow = new THREE.Sprite(boltParts.glow)
    glow.scale.setScalar(0.08)
    this.group.add(glow)
    this.group.position.copy(position)
    this.velocity = velocity.clone()
    this.group.quaternion.setFromUnitVectors(NOSE, tmpDirection.copy(velocity).normalize())
    this.previous = position.clone()
    this.life = BOLT_LIFE
    this.alive = true
  }

  get position() {
    return this.group.position
  }

  update(dt) {
    this.life -= dt
    this.previous.copy(this.group.position)
    this.group.position.addScaledVector(this.velocity, dt)
  }
}
