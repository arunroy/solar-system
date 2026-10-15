import * as THREE from 'three'
import { getGlowTexture } from './helpers.js'

const STAR_COLORS = ['#ffffff', '#cfe0ff', '#fff4e0', '#ffd8b0', '#b8ccff']

/** Background starfield on a distant shell; two layers give a mix of faint and bright stars. */
export function createStars() {
  const group = new THREE.Group()
  const layers = [
    { count: 9000, size: 2, brightness: [0.25, 0.7] },
    { count: 600, size: 3.5, brightness: [0.6, 0.9] },
  ]
  const color = new THREE.Color()

  for (const { count, size, brightness } of layers) {
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(1000 + Math.random() * 500)
      positions.set([v.x, v.y, v.z], i * 3)
      color.set(STAR_COLORS[(Math.random() * STAR_COLORS.length) | 0])
      color.multiplyScalar(brightness[0] + Math.random() * (brightness[1] - brightness[0]))
      colors.set([color.r, color.g, color.b], i * 3)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    group.add(
      new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          size,
          sizeAttenuation: false,
          vertexColors: true,
          map: getGlowTexture(),
          transparent: true,
          depthWrite: false,
        }),
      ),
    )
  }
  return group
}
