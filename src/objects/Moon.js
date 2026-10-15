import * as THREE from 'three'
import { createPlanetMaterial } from '../shaders/planet.js'
import { moonOrbit } from '../ephemeris.js'
import { createLabel, createOrbit } from './helpers.js'

const DEG = Math.PI / 180
const scratch = new THREE.Vector3()

/**
 * A moon on its real orbital longitude for the simulated date (see ephemeris.js). Moons orbit in their
 * planet's equatorial plane (the planet's tilted frame) unless `equatorial: false`: Earth's Moon keeps to
 * its own orbit, tilted 5.1° to the ecliptic, whose node regresses over 18.6 years.
 */
export class Moon {
  constructor(data, planet) {
    this.data = data
    this.id = data.id
    this.radius = data.radius
    this.planet = planet

    this.orbitPlane = new THREE.Group() // the orbit's own tilt, for orbits that aren't equatorial
    this.pivot = new THREE.Group() // turns to the moon's orbital longitude
    this.orbitPlane.add(this.pivot)
    ;(data.equatorial === false ? planet.group : planet.tilt).add(this.orbitPlane)

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(this.radius, 48, 24), createPlanetMaterial(data.surface))
    this.mesh.position.x = data.distance
    this.mesh.rotation.y = Math.PI // tidally locked: turn the map's near side (longitude 0) toward the planet
    this.pivot.add(this.mesh)

    this.orbitLine = new THREE.LineLoop(
      createOrbit(data.distance, 128).geometry,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false }),
    )
    this.orbitPlane.add(this.orbitLine)

    // Invisible sphere a few times the moon's size, so the small moons are easy to click
    this.hitTarget = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(this.radius * 3, 0.2), 12, 8),
      new THREE.MeshBasicMaterial(),
    )
    this.hitTarget.visible = false
    this.hitTarget.userData.body = this
    this.mesh.add(this.hitTarget)

    this.label = createLabel(this)
    this.label.position.set(0, this.radius * 1.15 + 0.06, 0)
    this.label.visible = false // shown only while its planet's system is in focus (SolarSystem.focusOn)
    this.mesh.add(this.label)
  }

  /** Close enough to fill a good part of the view: moons are much smaller than the planets. */
  get viewDistance() {
    return this.radius * 6 + 0.15
  }

  /** World position (moons sit inside their planet's moving, tilted frames). */
  get position() {
    return this.mesh.getWorldPosition(scratch).clone()
  }

  update(days) {
    const { longitude, node, inclination } = moonOrbit(this.data, days)
    if (inclination) {
      // Tilt the orbit about its ascending node, which lies in the ecliptic at longitude `node`
      const nodeDirection = new THREE.Vector3(Math.cos(node * DEG), 0, -Math.sin(node * DEG))
      this.orbitPlane.quaternion.setFromAxisAngle(nodeDirection, inclination * DEG)
    }
    // Counter-clockwise about the orbit's pole, like the planets; longitude 0 is the J2000 equinox (+X)
    this.pivot.rotation.y = (longitude * DEG) % (Math.PI * 2)
  }
}
