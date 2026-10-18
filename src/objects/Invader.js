import * as THREE from 'three'
import { getGlowTexture } from './helpers.js'

const UP = new THREE.Vector3(0, 1, 0)
const tmp = new THREE.Vector3()
const tmpMatrix = new THREE.Matrix4()
const tmpQuaternion = new THREE.Quaternion()

// How each kind flies and fights. Fighters hunt the player; raiders circle the planet and bombard it, only
// shooting back at a player who comes close. Both bombard the planet while nobody is chasing them.
const KINDS = {
  fighter: {
    scale: 0.11,
    radius: 0.08,
    health: 1,
    speed: 3.4,
    acceleration: 5,
    engage: 7, // starts chasing the player inside this distance…
    disengage: 12, // …and gives up beyond this
    orbit: (planet) => planet.radius * 1.5 + 1.3,
    bombard: [3, 5], // seconds between shots at the planet
    attack: [1.1, 1.9], // and at the player
    score: 100,
  },
  raider: {
    scale: 0.17,
    radius: 0.14,
    health: 2,
    speed: 1.6,
    acceleration: 2.5,
    engage: 2.6,
    disengage: 3.5,
    orbit: (planet) => planet.radius * 1.8 + 0.7,
    bombard: [1.6, 2.6],
    attack: [1.4, 2.2],
    score: 250,
  },
}
const BOLT_SPEED = 7.5
const FIRE_CONE = 0.35 // rad: fighters shoot only with the player nearly dead ahead
const FIRE_RANGE = 6
const PASS_DISTANCE = 0.6 // attack runs aim to pass this far from the player…
const BREAK_DISTANCE = 1.4 // …and pull out once this close
const WARP_TIME = 0.5 // seconds to drop out of warp

let materials
function sharedMaterials() {
  materials ??= {
    // Not too metallic: with nothing for metal to reflect, it would render nearly black
    hull: new THREE.MeshStandardMaterial({ color: '#555a6b', metalness: 0.35, roughness: 0.45, flatShading: true }),
    plating: new THREE.MeshStandardMaterial({ color: '#6b5a85', metalness: 0.3, roughness: 0.5, flatShading: true }),
    neon: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.08, 0.05) }),
    canopy: new THREE.MeshStandardMaterial({ color: '#7a4aa8', metalness: 0.1, roughness: 0.2, emissive: '#9a30ff', emissiveIntensity: 0.18 }),
  }
  return materials
}

function glowSprite(color, size) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: getGlowTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  sprite.scale.setScalar(size)
  return sprite
}

/** A dark arrowhead with swept wings, red-lit edges and twin engines, about 1.3 units long, nose toward −Z. */
function createFighter() {
  const m = sharedMaterials()
  const model = new THREE.Group()
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.3, 4).scale(1, 1, 0.4).rotateX(-Math.PI / 2), m.hull)
  model.add(body)
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 10), m.canopy)
  canopy.scale.set(0.8, 0.5, 1.8)
  canopy.position.set(0, 0.06, -0.05)
  model.add(canopy)

  // One wing, then its mirror image
  const shape = new THREE.Shape()
  shape.moveTo(0.1, 0.25)
  shape.lineTo(0.95, -0.5)
  shape.lineTo(0.95, -0.72)
  shape.lineTo(0.1, -0.5)
  const wingGeometry = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false }).translate(0, 0, -0.02).rotateX(-Math.PI / 2)
  const edge = Math.hypot(0.85, 0.75)
  for (const side of [1, -1]) {
    const half = new THREE.Group()
    half.add(new THREE.Mesh(wingGeometry, m.plating))
    // A glowing strip along the leading edge, and a fin at the tip
    const strip = new THREE.Mesh(new THREE.BoxGeometry(edge, 0.025, 0.03), m.neon)
    strip.position.set(0.525, 0.012, 0.125)
    strip.rotation.y = -Math.atan2(0.75, 0.85)
    half.add(strip)
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.24), m.hull)
    fin.position.set(0.95, 0.08, 0.6)
    half.add(fin)
    half.scale.x = side
    model.add(half)
  }

  const lights = []
  for (const x of [-0.14, 0.14]) {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.2, 12).rotateX(Math.PI / 2), m.hull)
    engine.position.set(x, 0, 0.6)
    model.add(engine)
    const glow = glowSprite(new THREE.Color(2.6, 0.45, 0.2), 0.3)
    glow.position.set(x, 0, 0.74)
    model.add(glow)
    lights.push(glow)
  }
  return { model, engines: lights, rim: [] }
}

/** A flying saucer about 1.8 units across, with a glowing dome, a ring of chasing lights and a red core beneath. */
function createRaider() {
  const m = sharedMaterials()
  const model = new THREE.Group()
  const profile = [
    [0, -0.16],
    [0.35, -0.13],
    [0.7, -0.05],
    [0.9, 0],
    [0.7, 0.05],
    [0.4, 0.1],
    [0, 0.12],
  ].map(([r, y]) => new THREE.Vector2(r, y))
  model.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 32), m.hull))
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.03, 6, 48).rotateX(Math.PI / 2), m.plating)
  model.add(band)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.canopy)
  dome.position.y = 0.09
  model.add(dome)
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24).rotateX(Math.PI / 2), m.neon)
  core.position.y = -0.161
  model.add(core)
  const coreGlow = glowSprite(new THREE.Color(2.2, 0.2, 0.15), 0.7)
  coreGlow.position.y = -0.2
  model.add(coreGlow)

  const rim = []
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const light = glowSprite(new THREE.Color(2.2, 0.9, 0.25), 0.18)
    light.position.set(Math.cos(a) * 0.93, 0, Math.sin(a) * 0.93)
    model.add(light)
    rim.push(light)
  }
  return { model, engines: [coreGlow], rim }
}

const randomBetween = ([a, b]) => a + Math.random() * (b - a)

/**
 * An invading ship. It drops out of warp, flies to the planet it was sent against and circles it,
 * bombarding it, and turns on the player who comes near. It flies like an arcade ship (it isn't bound by
 * gravity), steering round planets and moons rather than through them.
 */
export class Invader {
  constructor(kind, target, position, difficulty = 1, aim = 1) {
    this.kind = kind
    this.spec = KINDS[kind]
    const built = kind === 'raider' ? createRaider() : createFighter()
    this.group = built.model
    this.engines = built.engines
    this.rim = built.rim
    this.group.position.copy(position)
    this.group.scale.setScalar(0.001)
    this.target = target // the planet's entry in Gravity, which carries it along with the planet
    this.difficulty = difficulty
    this.aim = aim // scales the scatter of shots at the player: lower is deadlier
    this.velocity = new THREE.Vector3()
    this.health = this.spec.health
    this.radius = this.spec.radius
    this.alive = true
    this.engaged = false
    this.time = Math.random() * 10
    this.warp = 0
    this.cooldown = 1 + Math.random() * 2
    this.breakAway = 0 // seconds left pulling out of an attack run
    this.passSide = new THREE.Vector3().randomDirection() // which side of the player the next run passes

    // Each circles the planet on an orbit of its own, starting at the point nearest where it arrives
    this.orbitRadius = this.spec.orbit(target.body)
    this.orbitNormal = new THREE.Vector3().randomDirection()
    this.orbitNormal.y *= 0.5
    this.orbitNormal.normalize()
    this.orbitU = new THREE.Vector3().crossVectors(this.orbitNormal, UP)
    if (this.orbitU.lengthSq() < 1e-6) this.orbitU.set(1, 0, 0)
    this.orbitU.normalize()
    this.orbitW = new THREE.Vector3().crossVectors(this.orbitNormal, this.orbitU)
    const rel = position.clone().sub(target.position)
    this.orbitAngle = Math.atan2(rel.dot(this.orbitW), rel.dot(this.orbitU))
    this.orbitDirection = Math.random() < 0.5 ? 1 : -1
    this.worldVelocity = new THREE.Vector3() // including the planet's motion, for whoever aims at it
  }

  get position() {
    return this.group.position
  }

  get speed() {
    return this.spec.speed * (0.85 + this.difficulty * 0.15)
  }

  /**
   * `world`: { player: { position, velocity, alive }, bodies, fire(from, velocity), aggressive } — where
   * `fire` launches a bolt and `aggressive` is false once the game is over.
   */
  update(dt, world) {
    this.time += dt
    if (this.warp < 1) {
      this.warp = Math.min(1, this.warp + dt / WARP_TIME)
      this.group.scale.setScalar(this.spec.scale * (1 - (1 - this.warp) ** 3))
    }
    const pos = this.group.position
    const planet = this.target
    const { player } = world
    const toPlayer = tmp.subVectors(player.position, pos)
    const playerDistance = toPlayer.length()
    if (!player.alive) this.engaged = false
    else if (playerDistance < this.spec.engage) this.engaged = true
    else if (playerDistance > this.spec.disengage) this.engaged = false

    const desired = new THREE.Vector3()
    const speed = this.speed
    const chasing = this.engaged && this.kind === 'fighter'
    if (chasing) {
      this.breakAway -= dt
      if (this.breakAway > 0) {
        // Pull out past the player, then turn for another run
        desired.copy(this.velocity).normalize().addScaledVector(toPlayer, -0.5 / Math.max(playerDistance, 0.1))
        desired.normalize().multiplyScalar(speed * 1.2)
      } else {
        // Run in at where the player will be, aiming to pass just beside them rather than ram them
        const lead = toPlayer.clone().addScaledVector(player.velocity, playerDistance / BOLT_SPEED)
        const aside = this.passSide.clone().addScaledVector(lead, -this.passSide.dot(lead) / lead.lengthSq())
        desired.copy(lead).addScaledVector(aside.normalize(), PASS_DISTANCE).normalize().multiplyScalar(speed)
        if (playerDistance < BREAK_DISTANCE) {
          this.breakAway = 0.6 + Math.random() * 0.5
          this.passSide.randomDirection()
        }
      }
    } else {
      // Circle the planet
      this.orbitAngle += ((speed * 0.6) / this.orbitRadius) * this.orbitDirection * dt
      const spot = planet.position
        .clone()
        .addScaledVector(this.orbitU, Math.cos(this.orbitAngle) * this.orbitRadius)
        .addScaledVector(this.orbitW, Math.sin(this.orbitAngle) * this.orbitRadius)
      desired.subVectors(spot, pos).multiplyScalar(1.5)
      if (desired.length() > speed) desired.setLength(speed)
    }

    // Steer round anything solid
    for (const body of world.bodies) {
      const away = pos.clone().sub(body.position)
      const gap = away.length() - body.radius - this.radius
      const margin = 0.5
      if (gap < margin) desired.addScaledVector(away.normalize(), speed * 2 * (1 - Math.max(0, gap) / margin))
    }

    const change = desired.sub(this.velocity)
    const most = this.spec.acceleration * dt
    if (change.length() > most) change.setLength(most)
    this.velocity.add(change)
    pos.addScaledVector(this.velocity, dt).add(planet.displacement)
    this.worldVelocity.copy(this.velocity).add(planet.velocity)
    for (const body of world.bodies) {
      // Never inside a body, whatever the steering did
      const away = pos.clone().sub(body.position)
      const min = body.radius + this.radius
      if (away.lengthSq() < min * min) pos.copy(body.position).addScaledVector(away.normalize(), min)
    }

    this.orient(dt, change.divideScalar(Math.max(dt, 1e-6)))
    this.shoot(dt, world, chasing, playerDistance)
    this.animate()
  }

  /** Fighters face where they're going and bank into turns; saucers stay level and spin. */
  orient(dt, acceleration) {
    if (this.kind === 'raider') {
      this.group.rotation.y += dt * 1.6
      return
    }
    if (this.velocity.lengthSq() < 1e-4) return
    const pos = this.group.position
    const forward = this.velocity.clone().normalize()
    const lateral = acceleration.addScaledVector(forward, -acceleration.dot(forward))
    const up = UP.clone().addScaledVector(lateral, 0.25).normalize()
    tmpMatrix.lookAt(pos, pos.clone().add(forward), up)
    tmpQuaternion.setFromRotationMatrix(tmpMatrix)
    this.group.quaternion.slerp(tmpQuaternion, 1 - Math.exp(-6 * dt))
  }

  shoot(dt, world, chasing, playerDistance) {
    this.cooldown -= dt
    if (this.cooldown > 0 || this.warp < 1 || !world.aggressive) return
    const pos = this.group.position
    const { player } = world
    const pace = 1 / (0.8 + this.difficulty * 0.2) // later waves shoot more often

    if (this.engaged && playerDistance < FIRE_RANGE) {
      const lead = player.position.clone().sub(pos).addScaledVector(player.velocity, playerDistance / BOLT_SPEED)
      // Fighters need their nose on the player; a saucer's turret fires any way
      const facing = new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion)
      if (this.kind === 'fighter' && facing.angleTo(lead) > FIRE_CONE) return
      const spread = new THREE.Vector3().randomDirection().multiplyScalar(0.025 * this.aim)
      world.fire(pos, lead.normalize().add(spread).normalize().multiplyScalar(BOLT_SPEED).add(this.target.velocity))
      this.cooldown = randomBetween(this.spec.attack) * pace
    } else if (!chasing) {
      const toPlanet = this.target.position.clone().sub(pos)
      if (toPlanet.length() > this.orbitRadius + 1) return
      const spread = new THREE.Vector3().randomDirection().multiplyScalar(0.08)
      world.fire(pos, toPlanet.normalize().add(spread).normalize().multiplyScalar(BOLT_SPEED).add(this.target.velocity))
      this.cooldown = randomBetween(this.spec.bombard) * pace
    }
  }

  animate() {
    const pulse = 0.85 + 0.15 * Math.sin(this.time * 30)
    for (const engine of this.engines) engine.material.opacity = pulse
    // The saucer's rim lights chase round
    this.rim.forEach((light, i) => {
      const phase = (((this.time * 2.5 - i / this.rim.length) % 1) + 1) % 1
      light.material.opacity = phase < 0.25 ? 1 : 0.06
    })
  }

  dispose() {
    this.group.traverse((object) => {
      if (object.isSprite) object.material.dispose()
      else if (object.geometry) object.geometry.dispose()
    })
  }
}

export const INVADER_SCORES = { fighter: KINDS.fighter.score, raider: KINDS.raider.score }
