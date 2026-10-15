import * as THREE from 'three'

// How rocks part around the mouse: they are pushed outward from the cursor's point on the orbital plane.
// Sizes scale with the camera's distance to that point, so the parting looks the same at any zoom
const HOVER_RADIUS = 0.07 // falloff radius, as a share of the camera distance (≈ 70 px on screen)
const HOVER_PUSH = 0.5 // sideways push at the cursor, in falloff radii
const HOVER_LIFT = 0.15 // and a little lift, so the parting reads from above too
const FOLLOW_RATE = 8 // how quickly the disturbance catches up with the cursor (per second)

/** Thousands of rocks drawn in a single draw call via InstancedMesh. */
export class AsteroidBelt {
  constructor({ inner, outer, count, period }) {
    this.period = period
    this.hoverTarget = new THREE.Vector3()
    this.hoverActive = false

    this.uniforms = {
      uHoverPoint: { value: new THREE.Vector3() },
      uHover: { value: 0 }, // 0–1, eased in and out
      uHoverRadius: { value: 1 },
      uTime: { value: 0 },
    }
    const material = new THREE.MeshStandardMaterial({ color: '#8b8178', roughness: 1, flatShading: true })
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms)
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
          uniform vec3 uHoverPoint;
          uniform float uHover;
          uniform float uHoverRadius;
          uniform float uTime;`,
        )
        .replace(
          '#include <project_vertex>',
          /* glsl */ `
          vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
          // Move the whole rock by an offset computed at its centre, so it shifts without deforming
          vec3 center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec3 away = center - uHoverPoint;
          away.y = 0.0;
          float dist = length(away);
          float radius = max(uHoverRadius, 1e-3);
          float strength = uHover * exp(-(dist * dist) / (radius * radius));
          // Each rock wobbles a little out of phase with its neighbours while it is disturbed
          float wobble = sin(uTime * 3.0 + center.x * 1.7 + center.z * 2.3) * 0.15;
          vec3 offset = away / max(dist, 1e-3) * strength * uHoverRadius * ${HOVER_PUSH.toFixed(3)}
            + vec3(0.0, strength * uHoverRadius * (${HOVER_LIFT.toFixed(3)} + wobble), 0.0);
          vec4 world = modelMatrix * mvPosition;
          world.xyz += offset;
          mvPosition = viewMatrix * world;
          gl_Position = projectionMatrix * mvPosition;`,
        )
    }
    material.customProgramCacheKey = () => 'asteroid-hover'

    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), material, count)

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

  /** Where the cursor meets the orbital plane (null when it isn't over the scene), and the camera's distance to it. */
  setHover(point, cameraDistance = 0) {
    this.hoverActive = point !== null
    if (!point) return
    this.hoverTarget.copy(point)
    this.uniforms.uHoverRadius.value = cameraDistance * HOVER_RADIUS
  }

  update(days, dt, elapsed) {
    // Positive Y rotation maps +X toward −Z: the same counter-clockwise direction as the planets
    this.mesh.rotation.y = ((days / this.period) % 1) * Math.PI * 2

    const { uHoverPoint, uHover, uTime } = this.uniforms
    const ease = 1 - Math.exp(-FOLLOW_RATE * dt)
    // Jump straight to the cursor when the disturbance has faded, so it never sweeps in from far away
    if (uHover.value < 0.01) uHoverPoint.value.copy(this.hoverTarget)
    else uHoverPoint.value.lerp(this.hoverTarget, ease)
    uHover.value += ((this.hoverActive ? 1 : 0) - uHover.value) * ease * 0.5
    uTime.value = elapsed
  }
}
