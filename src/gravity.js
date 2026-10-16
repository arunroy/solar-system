import * as THREE from 'three'

// Each body pulls with its real surface gravity, scaled down for the scene: Earth's 9.81 m/s² becomes
// 1.5 units/s², which the ship's thrust (4.5) beats comfortably. Jupiter's 24.8 m/s² becomes 3.7, which it
// only just escapes.
const G_SCALE = 0.15
// With distances compressed, the Sun's real gravity would drag everything into it. It is set so that a
// circular orbit at Earth's distance runs at about 1.9 units/s, inside the ship's cruising speed.
const SUN_GM = 60
// A planet's sphere of influence, r = d·(m/M)^0.4, is capped to a few radii beyond its moons, so the
// giants' spheres don't swallow the space between them
const SOI_CAP = 5
const EARTH_ORBIT_KMS = 29.78 // Earth's real speed round the Sun

/** Pull of a point mass `gm` at `center` on `point`, added to `out`. Inside `radius` it stops growing. */
function addPull(out, center, gm, radius, point) {
  const dx = center.x - point.x
  const dy = center.y - point.y
  const dz = center.z - point.z
  const r2 = Math.max(dx * dx + dy * dy + dz * dz, radius * radius)
  const k = gm / (r2 * Math.sqrt(r2))
  out.x += dx * k
  out.y += dy * k
  out.z += dz * k
}

/**
 * Gravity for the spaceship, by patched conics, the approximation used to plan real missions: inside a
 * planet's sphere of influence only that planet and its moons pull, and the ship is carried along with the
 * planet (its frame of reference); outside, the Sun and the planets pull. Planets in the scene follow fixed
 * paths rather than falling round the Sun, and with distances compressed the Sun's tides would tear apart
 * any orbit wider than about a planet's diameter, so this keeps orbits round a planet stable at any time speed.
 */
export class Gravity {
  constructor(sun, planets) {
    const source = (body, gm) => ({ body, gm, radius: body.radius, position: body.position.clone() })
    this.sun = source(sun, SUN_GM)
    this.sun.position.set(0, 0, 0)
    // Orbital speeds scale as √(g·R), so a speed here maps to the real one by √(real g·R / scene g·R).
    // Round the Sun, distances aren't scaled in proportion, so its scale is set from Earth's orbit instead.
    const earth = planets.find((planet) => planet.id === 'earth')
    this.sun.speedScale = EARTH_ORBIT_KMS / Math.sqrt(SUN_GM / earth.data.distance)
    this.planets = planets.map((planet) => {
      const gm = planet.data.gravity * G_SCALE * planet.radius ** 2
      const d = planet.data.distance
      const reach = Math.max(planet.radius * SOI_CAP, ...planet.moons.map((moon) => moon.data.distance + 2))
      return {
        ...source(planet, gm),
        speedScale: Math.sqrt((planet.data.radiusKm * 1000) / (G_SCALE * planet.radius)) / 1000,
        soi: Math.min(d * (gm / SUN_GM) ** 0.4, reach),
        moons: planet.moons.map((moon) => source(moon, moon.data.gravity * G_SCALE * moon.radius ** 2)),
        velocity: new THREE.Vector3(),
        displacement: new THREE.Vector3(),
      }
    })
  }

  /** Snapshot where everything is this frame (after the bodies have moved), and how fast each planet goes. */
  update(dt) {
    for (const planet of this.planets) {
      const now = planet.body.position
      planet.displacement.subVectors(now, planet.position)
      if (dt > 0) planet.velocity.copy(planet.displacement).divideScalar(dt)
      planet.position.copy(now)
      for (const moon of planet.moons) moon.position.copy(moon.body.position)
    }
  }

  /**
   * The planet whose sphere of influence holds `point`, or null for the Sun's. Where two spheres overlap
   * (Venus and Earth pass within 4.5 units), the one pulling harder wins.
   */
  frameAt(point) {
    let frame = null
    let strongest = 0
    for (const planet of this.planets) {
      const d2 = planet.position.distanceToSquared(point)
      if (d2 < planet.soi * planet.soi && planet.gm / d2 > strongest) [frame, strongest] = [planet, planet.gm / d2]
    }
    return frame
  }

  /** Acceleration at `point` in the frame of `frame` (a planet, or null for the Sun's), into `out`. */
  acceleration(point, frame, out) {
    out.set(0, 0, 0)
    if (frame) {
      addPull(out, frame.position, frame.gm, frame.radius, point)
      for (const moon of frame.moons) addPull(out, moon.position, moon.gm, moon.radius, point)
      return out
    }
    addPull(out, this.sun.position, this.sun.gm, this.sun.radius, point)
    // Outside their spheres of influence the planets' pull is weak, but it bends the path on the way in
    for (const planet of this.planets) addPull(out, planet.position, planet.gm, planet.radius, point)
    return out
  }

  /**
   * The coasting orbit about the frame's body, from position and velocity (relative to that body): its
   * semi-major axis `a`, eccentricity `e`, periapsis and apoapsis (distances from the centre; apoapsis is
   * Infinity on an open orbit), and `status`: 'orbit' if it's closed and clears the surface, 'falling' if it
   * comes within `clearance` of the surface, 'escaping' if it's open (or, round a planet, reaches past its sphere of influence).
   */
  orbitAround(frame, point, velocity, clearance = 0) {
    const center = frame ?? this.sun
    const r = point.clone().sub(center.position)
    const gm = center.gm
    const energy = velocity.lengthSq() / 2 - gm / r.length()
    const h = r.clone().cross(velocity)
    const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h.lengthSq()) / (gm * gm)))
    // Periapsis from the angular momentum, which stays finite on open orbits too
    const periapsis = h.lengthSq() / gm / (1 + e)
    if (energy >= 0) return { status: 'escaping', a: Infinity, e, periapsis, apoapsis: Infinity }
    const a = -gm / (2 * energy)
    const apoapsis = a * (1 + e)
    let status = 'orbit'
    if (periapsis < center.radius + clearance) status = 'falling'
    else if (frame && apoapsis > frame.soi) status = 'escaping'
    return { status, a, e, periapsis, apoapsis }
  }

  /**
   * Converts the ship's speed relative to `frame` (scene units/s) to the real speed in km/s of the same
   * orbit at the same height, in body radii, round the real body. A circular orbit just above Earth then
   * reads 7.9 km/s, as in low Earth orbit; round the Sun, Earth's distance maps to its real 29.8 km/s.
   */
  realSpeed(frame, speed) {
    return speed * (frame ? frame.speedScale : this.sun.speedScale)
  }
}
