import * as THREE from 'three'
import { Invader, INVADER_SCORES } from './objects/Invader.js'
import { Missile, Bolt, Effects, segmentHits } from './objects/weapons.js'

const HULL = 100
export const RACK = 8 // missiles carried
const FIRE_INTERVAL = 0.3
const LOCK_RANGE = 16
const LOCK_CONE = THREE.MathUtils.degToRad(25)
const CRASH_SPEED = 2 // impacts harder than this damage the hull
const RESPAWN_DELAY = 3
const WAVE_DELAY = 4
const SPAWN_GAP = 0.6 // seconds between ships dropping out of warp
const HIGH_SCORE_KEY = 'solar-system:high-score'
const DIFFICULTY_KEY = 'solar-system:difficulty'
const WARP_COLOR = new THREE.Color(1.2, 0.5, 2.4)
const HIT_COLOR = new THREE.Color(2.4, 0.6, 0.3)

/**
 * The difficulty levels. `enemy` is how fast invaders fly and shoot in the first wave, and `ramp` how much
 * that grows with each wave after; `extra` adds invaders to (or takes them from) every wave; `score` scales
 * all points, so a harder game scores more; `aim` scales how widely invaders' shots at the player scatter.
 */
export const DIFFICULTIES = {
  easy: {
    name: 'Easy',
    lives: 5,
    reloadTime: 1.1, // seconds to load each missile back onto the rack
    lockTime: 0.3, // seconds with a target in the cone before the lock holds
    boltDamage: 5,
    ramDamage: 20,
    repairRate: 25, // hull per second while landed
    planetHit: 0.8, // share of a planet's defences each bolt destroys, %
    safeTime: 3.5, // seconds of protection after respawning
    enemy: 0.6,
    ramp: 0.1,
    extra: -1,
    score: 0.5,
    aim: 1,
  },
  normal: {
    name: 'Normal',
    lives: 3,
    reloadTime: 1.5,
    lockTime: 0.45,
    boltDamage: 8,
    ramDamage: 30,
    repairRate: 15,
    planetHit: 1.5,
    safeTime: 2.5,
    enemy: 1,
    ramp: 0.15,
    extra: 0,
    score: 1,
    aim: 1,
  },
  hard: {
    name: 'Hard',
    lives: 2,
    reloadTime: 1.9,
    lockTime: 0.6,
    boltDamage: 12,
    ramDamage: 40,
    repairRate: 10,
    planetHit: 2.2,
    safeTime: 2,
    enemy: 1.5,
    ramp: 0.2,
    extra: 1,
    score: 1.5,
    aim: 0.35,
  },
}
const LEVELS = Object.keys(DIFFICULTIES)

// Normal keeps the key from before there were levels, so earlier best scores carry over
const highScoreKey = (difficulty) => (difficulty === 'normal' ? HIGH_SCORE_KEY : `${HIGH_SCORE_KEY}:${difficulty}`)

function readHighScore(difficulty) {
  try {
    return Number(localStorage.getItem(highScoreKey(difficulty))) || 0
  } catch {
    return 0
  }
}

function readDifficulty() {
  try {
    const saved = localStorage.getItem(DIFFICULTY_KEY)
    return saved in DIFFICULTIES ? saved : 'normal'
  } catch {
    return 'normal'
  }
}

const nameOf = (body) => body.data.name

/**
 * The game: invaders arrive in waves to attack a planet, and the player's ship fights them with homing
 * missiles. Space (or a click) fires; a missile homes on whatever the nose has locked onto. The player has
 * a few ships (how many depends on the difficulty), and the game ends when the last is lost or a planet's
 * defences fall.
 */
export class Game {
  constructor(system) {
    this.system = system
    this.effects = new Effects()
    system.scene.add(this.effects.group)
    this.active = false
    this.invaders = []
    this.missiles = []
    this.bolts = []
    this.difficulty = readDifficulty()
    this.level = DIFFICULTIES[this.difficulty]
    this.highScores = Object.fromEntries(LEVELS.map((id) => [id, readHighScore(id)]))
    this.firing = false
    this.time = 0
    this.hurtAt = -Infinity
    this.message = null

    window.addEventListener('keydown', (e) => {
      if (!this.active || e.code !== 'Space' || e.target.matches('input, textarea')) return
      e.preventDefault()
      this.firing = true
    })
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.firing = false
    })
    window.addEventListener('blur', () => (this.firing = false))
    const canvas = system.renderer.domElement
    canvas.addEventListener('pointerdown', (e) => {
      if (this.active && e.button === 0) this.firing = true
    })
    window.addEventListener('pointerup', () => (this.firing = false))
  }

  /** The best score at the chosen difficulty. */
  get highScore() {
    return this.highScores[this.difficulty]
  }

  /** The difficulty can be changed between games, but not during one. */
  get canChangeDifficulty() {
    return !this.active || this.over
  }

  /** Choose the difficulty for the next game; it's remembered for later visits. */
  setDifficulty(id) {
    if (!(id in DIFFICULTIES) || !this.canChangeDifficulty) return
    this.difficulty = id
    try {
      localStorage.setItem(DIFFICULTY_KEY, id)
    } catch {
      // Storage may be blocked; the choice still holds for this visit
    }
  }

  /** Step to the next difficulty, from Hard back round to Easy. */
  cycleDifficulty() {
    this.setDifficulty(LEVELS[(LEVELS.indexOf(this.difficulty) + 1) % LEVELS.length])
  }

  get over() {
    return this.phase === 'over'
  }

  get invadersLeft() {
    return this.invaders.length + this.pending.length
  }

  /** The planet under attack this wave, and how much of its defences are left (0–100). */
  get defences() {
    return this.target ? this.planetDefences.get(this.target.id) : 100
  }

  /** Start a new game, defending the planet in focus (or the one the ship is near, or Earth). */
  start() {
    const { system } = this
    const pick = (body) => (body ? (body.planet ?? (body.id === 'sun' ? null : body)) : null)
    const earth = system.planets.find((planet) => planet.id === 'earth')
    const home = pick(system.focus) ?? (system.flying ? pick(system.ship.frameBody) : null) ?? earth
    this.level = DIFFICULTIES[this.difficulty]
    this.reset()
    this.active = true
    if (system.flying) system.launchShip(home)
    else system.startFlying(home)
    // Dogfights are hard enough without Newton: fly with flight assist (Z turns it off; it isn't saved)
    system.ship.assist = true
    this.queueWave(home)
  }

  /** End the game and clear the battlefield (the ship stays out, if still flying). */
  stop() {
    if (!this.active) return
    this.active = false
    this.reset()
    this.system.ship.loadAssist()
    this.system.ship.group.visible = this.system.flying
  }

  reset() {
    for (const thing of [...this.invaders, ...this.missiles, ...this.bolts]) this.remove(thing)
    this.invaders = []
    this.missiles = []
    this.bolts = []
    this.pending = []
    this.effects.clear()
    this.wave = 0
    this.score = 0
    this.lives = this.level.lives
    this.hull = HULL
    this.rack = RACK
    this.reload = 0
    this.cooldown = 0
    this.rail = 1
    this.lock = { invader: null, progress: 0, locked: false }
    this.planetDefences = new Map(this.system.planets.map((planet) => [planet.id, 100]))
    this.target = null
    this.phase = 'countdown'
    this.timer = 0
    this.respawnIn = 0
    this.safeFor = 0
    this.message = null
    this.firing = false
  }

  say(title, text, seconds = 3) {
    this.message = { title, text, until: seconds === Infinity ? Infinity : this.time + seconds }
  }

  /** Announce the next wave and where it's heading; it arrives after a few seconds. */
  queueWave(target) {
    this.wave++
    if (!target) {
      // Later waves strike anywhere, more often somewhere new
      const others = this.system.planets.filter((planet) => planet !== this.target && this.planetDefences.get(planet.id) > 0)
      target = Math.random() < 0.65 && others.length ? others[Math.floor(Math.random() * others.length)] : this.target
    }
    this.target = target
    this.phase = 'countdown'
    this.timer = this.wave === 1 ? 3 : WAVE_DELAY
    const { extra } = this.level
    const fighters = Math.max(1, 1 + this.wave + extra)
    const raiders = Math.max(0, Math.floor((this.wave + 1 + extra) / 2))
    const kinds = [...Array(raiders).fill('raider'), ...Array(fighters).fill('fighter')].sort(() => Math.random() - 0.5)
    this.pending = kinds.map((kind, i) => ({ kind, at: this.timer + i * SPAWN_GAP }))
    this.waveTime = 0
    const title = this.wave === 1 ? `Wave 1 · ${this.level.name}` : `Wave ${this.wave}`
    this.say(title, `${fighters + raiders} invaders are heading for ${nameOf(target)}`, this.timer + 1)
  }

  spawn(kind) {
    const planet = this.system.gravity.planets.find((p) => p.body === this.target)
    const direction = new THREE.Vector3().randomDirection()
    direction.y *= 0.4
    direction.normalize()
    const position = planet.position.clone().addScaledVector(direction, this.target.radius * 3 + 9)
    const invader = new Invader(kind, planet, position, this.level.enemy + (this.wave - 1) * this.level.ramp, this.level.aim)
    this.system.scene.add(invader.group)
    this.invaders.push(invader)
    this.effects.flash(position, 0.9, WARP_COLOR, 0.6)
  }

  remove(thing) {
    thing.alive = false
    this.system.scene.remove(thing.group)
    thing.dispose?.()
  }

  get playerVelocity() {
    const ship = this.system.ship
    const v = ship.velocity.clone()
    if (ship.frame) v.add(ship.frame.velocity)
    return v
  }

  update(dt) {
    if (!this.active) return
    const { system } = this
    const ship = system.ship
    this.time += dt
    const alive = ship.active

    if (alive) {
      if (ship.impactSpeed > CRASH_SPEED) this.damage((ship.impactSpeed - CRASH_SPEED) * 12)
      if (ship.landed) this.hull = Math.min(HULL, this.hull + this.level.repairRate * dt)
      this.safeFor = Math.max(0, this.safeFor - dt)
      // Blink while protected after respawning
      ship.group.visible = this.safeFor === 0 || Math.floor(this.safeFor * 8) % 2 === 0
    } else if (!this.over) {
      this.respawnIn -= dt
      if (this.respawnIn <= 0) this.respawn()
    }

    // Reload the rack one missile at a time
    if (this.rack < RACK) {
      this.reload += dt
      if (this.reload >= this.level.reloadTime) {
        this.reload = 0
        this.rack++
      }
    }
    this.cooldown -= dt
    this.updateLock(dt)
    if (this.firing && !this.over) this.fire()
    this.updateWave(dt)

    const world = {
      player: { position: ship.position, velocity: this.playerVelocity, alive: alive && this.safeFor === 0 },
      bodies: system.solidBodies,
      fire: (from, velocity) => this.enemyFire(from, velocity),
      aggressive: !this.over,
    }
    for (const invader of this.invaders) {
      if (!invader.alive) continue
      invader.update(dt, world)
      if (alive && invader.position.distanceTo(ship.position) < invader.radius + ship.hitRadius) {
        this.destroyInvader(invader)
        this.damage(this.level.ramDamage)
      }
    }
    this.updateMissiles(dt)
    this.updateBolts(dt)
    this.invaders = this.invaders.filter((invader) => invader.alive)
    this.effects.update(dt)
    if (this.message && this.time > this.message.until) this.message = null
  }

  updateWave(dt) {
    if (this.over) return
    this.waveTime += dt
    if (this.phase === 'countdown' && this.waveTime >= this.timer) this.phase = 'wave'
    while (this.pending.length && this.waveTime >= this.pending[0].at) this.spawn(this.pending.shift().kind)
    if (this.phase === 'wave' && this.invadersLeft === 0) {
      const bonus = Math.round((200 * this.wave + Math.round(this.defences) * 5) * this.level.score)
      this.score += bonus
      this.say(`Wave ${this.wave} cleared`, `${nameOf(this.target)} is safe · bonus ${bonus.toLocaleString('en')}`, 3)
      this.queueWave()
      this.timer += 1 // time to read the message
      for (const p of this.pending) p.at += 1
    }
    if (this.defences <= 0) this.planetFalls()
  }

  /** Lock onto the invader nearest the nose, inside a cone ahead; the lock holds after a moment on target. */
  updateLock(dt) {
    const ship = this.system.ship
    let best = null
    let bestScore = Infinity
    if (ship.active) {
      const forward = ship.forward
      for (const invader of this.invaders) {
        if (!invader.alive || invader.warp < 1) continue
        const rel = invader.position.clone().sub(ship.position)
        const d = rel.length()
        const angle = rel.angleTo(forward)
        if (d > LOCK_RANGE || angle > LOCK_CONE) continue
        const score = angle + d * 0.01
        if (score < bestScore) [best, bestScore] = [invader, score]
      }
    }
    const lock = this.lock
    if (best !== lock.invader) Object.assign(lock, { invader: best, progress: 0, locked: false })
    else if (best) {
      lock.progress = Math.min(1, lock.progress + dt / this.level.lockTime)
      if (!lock.locked && lock.progress >= 1) {
        lock.locked = true
        this.system.shipAudio.lock()
      }
    }
  }

  fire() {
    const ship = this.system.ship
    if (!ship.active || this.rack < 1 || this.cooldown > 0) return
    this.cooldown = FIRE_INTERVAL
    this.rack--
    // From the rails either side of the service module, in turn
    this.rail = -this.rail
    const q = ship.group.quaternion
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q)
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(q)
    const forward = ship.forward
    const origin = ship.position.clone().addScaledVector(right, 0.03 * this.rail).addScaledVector(down, 0.015).addScaledVector(forward, -0.01)
    const velocity = this.playerVelocity.addScaledVector(forward, 1.5).addScaledVector(right, 0.3 * this.rail)
    const missile = new Missile(origin, forward, velocity, this.lock.locked ? this.lock.invader : null)
    this.system.scene.add(missile.group)
    this.missiles.push(missile)
    this.system.shipAudio.missile()
  }

  updateMissiles(dt) {
    for (const missile of this.missiles) {
      missile.update(dt, this.effects)
      const hit = this.invaders.find(
        (invader) => invader.alive && segmentHits(missile.previous, missile.position, invader.position, invader.radius + 0.03),
      )
      if (hit) {
        this.remove(missile)
        this.hitInvader(hit, missile.position)
        continue
      }
      const body = this.system.solidBodies.find((b) => b.position.distanceToSquared(missile.position) < b.radius * b.radius)
      if (body || missile.life <= 0) {
        this.remove(missile)
        this.effects.explosion(missile.position, 0.5)
        this.boom(missile.position, 0.4)
      }
    }
    this.missiles = this.missiles.filter((missile) => missile.alive)
  }

  enemyFire(from, velocity) {
    const bolt = new Bolt(from, velocity)
    this.system.scene.add(bolt.group)
    this.bolts.push(bolt)
    this.system.shipAudio.laser(from.distanceTo(this.system.ship.position))
  }

  updateBolts(dt) {
    const ship = this.system.ship
    for (const bolt of this.bolts) {
      bolt.update(dt)
      if (ship.active && segmentHits(bolt.previous, bolt.position, ship.position, ship.hitRadius + 0.04)) {
        this.remove(bolt)
        this.effects.flash(bolt.position, 0.25, HIT_COLOR, 0.3)
        this.damage(this.level.boltDamage)
        continue
      }
      const body = this.system.solidBodies.find((b) => b.position.distanceToSquared(bolt.position) < b.radius * b.radius)
      if (body) {
        // A hit on the planet: a flash where it strikes, and its defences weaken
        this.remove(bolt)
        const surface = bolt.position.clone().sub(body.position).setLength(body.radius * 1.01).add(body.position)
        this.effects.flash(surface, 0.12 + body.radius * 0.08, HIT_COLOR, 0.5)
        this.effects.burst(surface, 8, 0.3, HIT_COLOR, 0.6)
        if (body === this.target && !this.over) {
          this.planetDefences.set(body.id, Math.max(0, this.defences - this.level.planetHit))
        }
      } else if (bolt.life <= 0) {
        this.remove(bolt)
      }
    }
    this.bolts = this.bolts.filter((bolt) => bolt.alive)
  }

  hitInvader(invader, at) {
    invader.health--
    if (invader.health <= 0) {
      this.destroyInvader(invader)
    } else {
      this.effects.explosion(at, 0.45, invader.worldVelocity)
      this.boom(at, 0.4)
    }
  }

  destroyInvader(invader) {
    if (!invader.alive) return
    this.effects.explosion(invader.position, invader.kind === 'raider' ? 1.7 : 1.15, invader.worldVelocity)
    this.boom(invader.position, invader.kind === 'raider' ? 1 : 0.75)
    if (!this.over) this.score += Math.round(INVADER_SCORES[invader.kind] * this.level.score)
    this.remove(invader)
  }

  boom(position, size) {
    this.system.shipAudio.explosion(position.distanceTo(this.system.ship.position), size)
  }

  damage(amount) {
    const ship = this.system.ship
    if (!ship.active || this.safeFor > 0 || this.over) return
    this.hull -= amount
    this.hurtAt = this.time
    this.system.shake = Math.min(1, this.system.shake + amount / 25)
    this.system.shipAudio.hit(amount)
    if (this.hull <= 0) this.destroyShip()
  }

  destroyShip() {
    const ship = this.system.ship
    this.hull = 0
    this.effects.explosion(ship.position, 1.6, this.playerVelocity)
    this.boom(ship.position, 1.2)
    this.system.shake = 1
    ship.park()
    ship.velocity.set(0, 0, 0)
    this.lives--
    if (this.lives <= 0) {
      this.gameOver('Your last ship was destroyed')
    } else {
      this.respawnIn = RESPAWN_DELAY
      this.say('Ship destroyed', `${this.lives} ${this.lives === 1 ? 'ship' : 'ships'} left · launching a new one`, RESPAWN_DELAY)
    }
  }

  respawn() {
    this.system.launchShip(this.target)
    this.hull = HULL
    this.rack = RACK
    this.safeFor = this.level.safeTime
  }

  planetFalls() {
    const planet = this.target
    // Fires break out across the planet
    for (let i = 0; i < 8; i++) {
      const point = new THREE.Vector3().randomDirection().multiplyScalar(planet.radius * 1.01).add(planet.position)
      this.effects.explosion(point, 0.8 + planet.radius * 0.5)
    }
    this.gameOver(`${nameOf(planet)}'s defences have fallen`)
  }

  gameOver(reason) {
    this.phase = 'over'
    this.pending = []
    this.firing = false
    const best = this.score > this.highScore
    if (best) {
      this.highScores[this.difficulty] = this.score
      try {
        localStorage.setItem(highScoreKey(this.difficulty), String(this.score))
      } catch {
        // Storage may be blocked; the best score still shows for this visit
      }
    }
    const score = this.score.toLocaleString('en')
    this.say('Game over', `${reason}. Score ${score}${best ? `, a new best on ${this.level.name}` : ''}. Press G to play again (L changes the difficulty)`, Infinity)
  }
}
