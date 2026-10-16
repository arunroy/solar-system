import * as THREE from 'three'

const UP = new THREE.Vector3(0, 1, 0)
// Ring density (the image's alpha, how opaque the ring looks) above which the rings stop the ship: the
// dense B ring (≈ 0.9) and A ring (≈ 0.7) are solid; the faint C ring, the Cassini division and the
// Encke gap (≈ 0–0.5) can be flown through
const RING_SOLID = 0.6
const CELL = 1 // asteroid grid cell size, in scene units

/**
 * A planet's rings as a thin disc in its equatorial plane, solid where the ring image is dense and open
 * where it's faint: Saturn's Cassini division can be flown through, the B ring can't.
 */
export class RingCollider {
  constructor(planet) {
    this.planet = planet
    this.uniforms = planet.ringUniforms
    this.normal = new THREE.Vector3(0, 1, 0).applyQuaternion(planet.tilt.quaternion)
    this.body = { id: `${planet.id}-rings`, data: { name: `${planet.data.name}'s rings` } }
    this.density = null // read from the ring image once it has loaded
  }

  /** Ring density (0–1) at distance `rho` from the planet's centre, or 0 off the rings. */
  densityAt(rho) {
    const { uInner, uOuter, uMap } = this.uniforms
    const u = (rho - uInner.value) / (uOuter.value - uInner.value)
    if (u < 0 || u > 1) return 0
    if (!this.density) {
      const image = uMap.value?.image
      if (!image?.width) return 1 // not loaded yet: treat the rings as solid
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = 1
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(image, 0, 0, image.width, 1)
      const { data } = ctx.getImageData(0, 0, image.width, 1)
      this.density = Float32Array.from({ length: image.width }, (_, i) => data[i * 4 + 3] / 255)
    }
    return this.density[Math.min(this.density.length - 1, Math.floor(u * this.density.length))]
  }

  /**
   * Where the path from `from` to `to` first meets solid ring within `thickness` of the ring plane, as
   * { point, side } (side: which face it struck, ±1), or null.
   */
  hit(from, to, thickness) {
    const center = this.planet.position
    const s0 = from.clone().sub(center).dot(this.normal)
    const s1 = to.clone().sub(center).dot(this.normal)
    let t
    if (Math.abs(s1) <= thickness * 1.001) t = 1 // ends inside the slab, or resting on its face
    else if (Math.sign(s0) !== Math.sign(s1)) t = s0 / (s0 - s1) // crosses the plane
    else return null
    const point = from.clone().lerp(to, t)
    const inPlane = point.clone().sub(center)
    const rho = inPlane.addScaledVector(this.normal, -inPlane.dot(this.normal)).length()
    if (this.densityAt(rho) < RING_SOLID) return null
    return { point, side: Math.sign(s0) || 1 }
  }

  /** Stop the ship on the rings' face; returns the body it touched, or null. */
  collide(ship, from, thickness) {
    const hit = this.hit(from, ship.position, thickness)
    if (!hit) return null
    const center = this.planet.position
    const normal = this.normal.clone().multiplyScalar(hit.side)
    // Back on the face it came from, at the radius where it struck
    const along = hit.point.clone().sub(center)
    along.addScaledVector(this.normal, -along.dot(this.normal))
    ship.position.copy(center).add(along).addScaledVector(normal, thickness)
    ship.bounce(normal)
    return this.body
  }
}

/**
 * The asteroid belt's rocks as spheres. The belt turns as one rigid body, so the rocks sit still in its
 * own frame: they're binned once into a grid there, and the ship's path is tested only against the rocks
 * in the cells it passes through.
 */
export class BeltCollider {
  constructor(belt) {
    this.belt = belt
    this.rocks = []
    this.grid = new Map()
    this.maxRadius = 0
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    for (let i = 0; i < belt.mesh.count; i++) {
      belt.mesh.getMatrixAt(i, matrix)
      matrix.decompose(position, quaternion, scale)
      // The rocks are squashed icosahedra; a sphere a little inside their widest extent fits them well
      const radius = Math.max(scale.x, scale.y, scale.z) * 0.85
      this.rocks.push({ local: position.clone(), radius })
      this.maxRadius = Math.max(this.maxRadius, radius)
      const key = this.key(position.x, position.z)
      if (!this.grid.has(key)) this.grid.set(key, [])
      this.grid.get(key).push(i)
    }
    this.body = { id: 'asteroid', data: { name: 'an asteroid' }, position: new THREE.Vector3(), radius: 0 }
  }

  key(x, z) {
    return `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`
  }

  collide(ship, from) {
    const angle = this.belt.mesh.rotation.y
    // The path in the belt's own frame, to find the cells it passes through
    const a = from.clone().applyAxisAngle(UP, -angle)
    const b = ship.position.clone().applyAxisAngle(UP, -angle)
    const reach = this.maxRadius + ship.hitRadius
    if (Math.min(a.y, b.y) > 1 + reach || Math.max(a.y, b.y) < -1 - reach) return null
    const x0 = Math.floor((Math.min(a.x, b.x) - reach) / CELL)
    const x1 = Math.floor((Math.max(a.x, b.x) + reach) / CELL)
    const z0 = Math.floor((Math.min(a.z, b.z) - reach) / CELL)
    const z1 = Math.floor((Math.max(a.z, b.z) + reach) / CELL)
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 400) return null // far too fast a path to be near the belt anyway
    let touched = null
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        for (const i of this.grid.get(`${x},${z}`) ?? []) {
          const rock = this.rocks[i]
          this.body.position.copy(rock.local).applyAxisAngle(UP, angle)
          this.body.radius = rock.radius
          if (ship.collide(this.body, from)) touched = { ...this.body, position: this.body.position.clone() }
        }
      }
    }
    return touched
  }
}
