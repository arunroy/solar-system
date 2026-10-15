import * as THREE from 'three'
import { createPlanetMaterial } from '../shaders/planet.js'
import { createEarthMaterial } from '../shaders/earth.js'
import { loadTexture } from '../shaders/textures.js'
import { createLabel, createOrbit } from './helpers.js'

const TAU = Math.PI * 2
// Real rotation rates would turn Jupiter into a blur at high time speeds, so spin is slowed and capped
const SPIN_SCALE = 0.01
const MAX_SPIN = 1.5 // rad per real second

const ringVertexShader = /* glsl */ `
  uniform float uInner;
  uniform float uOuter;
  varying vec3 vWorld;
  varying float vR;

  void main() {
    vR = (length(position.xy) - uInner) / (uOuter - uInner);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const ringFragmentShader = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uPlanetCenter;
  uniform float uPlanetRadius;
  uniform float uOpacity;
  uniform float uCassini;
  uniform sampler2D uMap; // optional radial strip: inner edge on the left, alpha = ring density
  uniform float uHasMap;
  varying vec3 vWorld;
  varying float vR;

  float hash(float x) { return fract(sin(x * 127.1) * 43758.5453); }
  float noise1(float x) {
    float i = floor(x);
    return mix(hash(i), hash(i + 1.0), smoothstep(0.0, 1.0, fract(x)));
  }

  void main() {
    float r = vR;
    float bands = noise1(r * 60.0) * 0.5 + noise1(r * 160.0) * 0.3 + noise1(r * 12.0) * 0.4;
    float alpha = smoothstep(0.0, 0.05, r) * (1.0 - smoothstep(0.92, 1.0, r));
    alpha *= 0.35 + bands * 0.75;
    alpha *= 1.0 - (smoothstep(0.55, 0.57, r) - smoothstep(0.61, 0.63, r)) * 0.9 * uCassini;
    vec3 color = mix(uColorA, uColorB, clamp(bands, 0.0, 1.0));
    if (uHasMap > 0.5) {
      vec4 strip = texture2D(uMap, vec2(r, 0.5));
      color = strip.rgb;
      alpha = strip.a;
    }

    // Planet's shadow: does the ray toward the Sun (at the origin) hit the planet sphere?
    vec3 L = normalize(-vWorld);
    vec3 oc = uPlanetCenter - vWorld;
    float b = dot(oc, L);
    float d2 = dot(oc, oc) - b * b;
    float r2 = uPlanetRadius * uPlanetRadius;
    float lit = b > 0.0 ? smoothstep(r2 * 0.9, r2 * 1.1, d2) : 1.0;
    color *= 0.12 + 0.88 * lit;

    gl_FragColor = vec4(color, clamp(alpha * uOpacity, 0.0, 1.0));
  }
`

/**
 * Tilts the spin axis by `tilt` degrees, leaning the north pole toward heliocentric longitude
 * `poleLongitude`. The default of 180° leans toward −X.
 */
function tiltQuaternion({ tilt, poleLongitude = 180 }) {
  const lean = THREE.MathUtils.degToRad(poleLongitude)
  const leanDirection = new THREE.Vector3(Math.cos(lean), 0, -Math.sin(lean))
  const axis = new THREE.Vector3(0, 1, 0).cross(leanDirection).normalize()
  return new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(tilt))
}

export class Planet {
  constructor(data) {
    this.data = data
    this.id = data.id
    this.radius = data.radius

    this.group = new THREE.Group() // moves along the orbit
    this.tilt = new THREE.Group() // axial tilt
    this.tilt.quaternion.copy(tiltQuaternion(data))
    this.group.add(this.tilt)

    const material = data.surface.type === 'earth' ? createEarthMaterial(data.surface) : createPlanetMaterial(data.surface)
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(this.radius, 96, 48), material)
    this.tilt.add(this.mesh)

    if (data.rings) this.createRings(data.rings)
    if (data.moon) this.createMoon(data.moon)

    // Generous invisible sphere so small planets are easy to click from far away
    this.hitTarget = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(this.radius * 1.6, 1.2), 16, 12),
      new THREE.MeshBasicMaterial(),
    )
    this.hitTarget.visible = false
    this.hitTarget.userData.body = this
    this.group.add(this.hitTarget)

    this.label = createLabel(this)
    this.group.add(this.label)
    this.orbit = createOrbit(data.distance)
  }

  createRings({ inner, outer, colors = [], opacity = 1, cassini, map }) {
    const innerR = this.radius * inner
    const outerR = this.radius * outer
    const strip = map ? loadTexture(map) : null
    if (strip) strip.wrapS = THREE.ClampToEdgeWrapping
    this.ringUniforms = {
      uMap: { value: strip },
      uHasMap: { value: strip ? 1 : 0 },
      uInner: { value: innerR },
      uOuter: { value: outerR },
      uColorA: { value: new THREE.Color(colors[0]) },
      uColorB: { value: new THREE.Color(colors[1]) },
      uPlanetCenter: { value: new THREE.Vector3() },
      uPlanetRadius: { value: this.radius },
      uOpacity: { value: opacity },
      uCassini: { value: cassini ? 1 : 0 },
    }
    const rings = new THREE.Mesh(
      new THREE.RingGeometry(innerR, outerR, 160, 1),
      new THREE.ShaderMaterial({
        vertexShader: ringVertexShader,
        fragmentShader: ringFragmentShader,
        uniforms: this.ringUniforms,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    )
    rings.rotation.x = -Math.PI / 2
    this.tilt.add(rings)
  }

  createMoon({ radius, distance, period, surface }) {
    this.moon = { period }
    this.moonPivot = new THREE.Group()
    const moon = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), createPlanetMaterial(surface))
    moon.position.x = distance
    moon.rotation.y = Math.PI // tidally locked: turn the map's near side (longitude 0) toward the planet
    this.moonPivot.add(moon)
    this.moonPivot.add(
      new THREE.LineLoop(
        createOrbit(distance, 96).geometry,
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false }),
      ),
    )
    this.group.add(this.moonPivot)
  }

  /** World position. Planets are direct children of the scene, so local = world. */
  get position() {
    return this.group.position
  }

  update(days, dtDays, dt, elapsed) {
    const { L0, period, distance, rotationHours } = this.data
    const longitude = THREE.MathUtils.degToRad(L0) + ((days / period) % 1) * TAU
    // Counter-clockwise when viewed from above the north pole (+Y)
    this.group.position.set(Math.cos(longitude) * distance, 0, -Math.sin(longitude) * distance)

    if (dt > 0) {
      const spinPerDay = (24 / rotationHours) * TAU * SPIN_SCALE
      const angularVelocity = THREE.MathUtils.clamp((spinPerDay * dtDays) / dt, -MAX_SPIN, MAX_SPIN)
      this.mesh.rotation.y = (this.mesh.rotation.y + angularVelocity * dt) % TAU
    }
    this.mesh.material.uniforms.uTime.value = elapsed

    if (this.moonPivot) this.moonPivot.rotation.y = ((days / this.moon.period) % 1) * TAU
    if (this.ringUniforms) this.ringUniforms.uPlanetCenter.value.copy(this.group.position)
  }
}
