import * as THREE from 'three'

/** Thousands of rocks drawn in a single draw call via InstancedMesh. */
export class AsteroidBelt {
  constructor({ inner, outer, count, period }) {
    this.period = period
    this.mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: '#8b8178', roughness: 1, flatShading: true }),
      count,
    )

    const dummy = new THREE.Object3D()
    for (let i = 0; i < count; i++) {
      // Averaging two randoms clusters rocks toward the middle of the belt
      const r = inner + ((Math.random() + Math.random()) / 2) * (outer - inner)
      const a = Math.random() * Math.PI * 2
      dummy.position.set(Math.cos(a) * r, (Math.random() - 0.5) * 0.9, Math.sin(a) * r)
      dummy.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6)
      dummy.scale.set(1, 0.6 + Math.random() * 0.6, 0.8).multiplyScalar(0.04 + Math.pow(Math.random(), 3) * 0.16)
      dummy.updateMatrix()
      this.mesh.setMatrixAt(i, dummy.matrix)
    }
  }

  update(days) {
    // Positive Y rotation maps +X toward −Z: the same counter-clockwise direction as the planets
    this.mesh.rotation.y = ((days / this.period) % 1) * Math.PI * 2
  }
}
