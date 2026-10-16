import * as THREE from 'three'
import { getGlowTexture } from './helpers.js'

const SIZE = 0.1 // nose to engine bell, in scene units (Earth's radius is 1)
const HIT_RADIUS = SIZE * 0.5
const ACCELERATION = 4.5 // scene units/s² from the main engine
const BOOST = 8 // Shift multiplies thrust
const MAX_SPEED = 40 // a hard cap, so slingshot after slingshot can't outrun the collision checks
// Flight assist (Z) flies like an arcade game: the engine only pushes up to these speeds (relative to the
// planet the ship is near), S fires the main engine in reverse, and sideways drift dies away while
// thrusting, so the ship goes where it points
const CRUISE_SPEED = 3
const BOOST_SPEED = 24
const GRIP = 4
// Without it the ship flies as a real one does: the engine only pushes forward, nothing slows it, and it
// keeps drifting the way it's going until it burns against that. S fires the small attitude thrusters.
const RCS_ACCELERATION = 0.8
const HOLD_ACCELERATION = 6 // X: the most the thrusters give to cancel motion and gravity (Jupiter pulls 3.7)
const FRICTION = 4 // how quickly sliding along a surface stops, once landed
const TURN_RATE = 1.8 // top rotation rate, rad/s
const SPIN_ACCELERATION = 6 // rad/s²: rotations start and stop on the attitude thrusters, not instantly
const POINT_GAIN = 3 // P/R: how briskly the autopilot swings the nose to prograde or retrograde
const LEVEL_GAIN = 2 // with flight assist, how quickly the wings level with the planets' orbits
const PREDICT_STEPS = 300
const PREDICT_STEP = 1 / 25 // seconds, so the predicted path looks 12 s ahead
const ASSIST_KEY = 'solar-system:flight-assist'
const UP = new THREE.Vector3(0, 1, 0)

// Keys by KeyboardEvent.code, so they work on any keyboard layout
const KEYS = {
  thrust: ['KeyW'],
  reverse: ['KeyS'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['ArrowDown'], // pull back to climb, as in a flight sim
  down: ['ArrowUp'],
  rollLeft: ['KeyQ'],
  rollRight: ['KeyE'],
  boost: ['ShiftLeft', 'ShiftRight'],
  hold: ['KeyX'],
  prograde: ['KeyP'],
  retrograde: ['KeyR'],
}
const ALL_KEYS = new Set(Object.values(KEYS).flat())

/** Fraction of a disc of angular radius r1 covered by a disc of radius r2 whose centre is x away. */
function discCoverage(r1, r2, x) {
  if (x >= r1 + r2) return 0
  if (x <= Math.abs(r2 - r1)) return Math.min(1, (r2 * r2) / (r1 * r1))
  const clamp = (v) => Math.min(1, Math.max(-1, v))
  const a = r1 * r1 * Math.acos(clamp((x * x + r1 * r1 - r2 * r2) / (2 * x * r1)))
  const b = r2 * r2 * Math.acos(clamp((x * x + r2 * r2 - r1 * r1) / (2 * x * r2)))
  const c = 0.5 * Math.sqrt(Math.max(0, (-x + r1 + r2) * (x + r1 - r2) * (x - r1 + r2) * (x + r1 + r2)))
  return (a + b - c) / (Math.PI * r1 * r1)
}

function readAssist() {
  try {
    return localStorage.getItem(ASSIST_KEY) === '1'
  } catch {
    return false
  }
}

/** A texture painted on a canvas: `draw(ctx, width, height)`. */
function paint(width, height, draw, color = true) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d'), width, height)
  const texture = new THREE.CanvasTexture(canvas)
  if (color) texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

// Cylinder textures wrap round the hull: u = 0 faces up (+Y), u = 0.25 the right side; v = 0 is the front
function capsuleTextures() {
  const windows = [0.07, 0.93, 0.25, 0.75] // two forward-up, one each side
  const drawWindows = (ctx, w, fill) => {
    ctx.fillStyle = fill
    for (const u of windows) {
      ctx.beginPath()
      ctx.roundRect(u * w - 18, 34, 36, 44, 8)
      ctx.fill()
    }
  }
  const map = paint(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#d4d7dc'
    ctx.fillRect(0, 0, w, h)
    // Panels of slightly different tones, edged with seams and fastener dots
    for (let x = 0; x < w; x += 64) {
      for (let y = 0; y < h; y += 64) {
        ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + Math.random() * 0.05})`
        ctx.fillRect(x, y, 64, 64)
      }
    }
    ctx.fillStyle = 'rgba(70,74,82,0.6)'
    for (let x = 0; x < w; x += 64) ctx.fillRect(x - 1, 0, 2, h)
    for (let y = 64; y < h; y += 64) ctx.fillRect(0, y - 1, w, 2)
    ctx.fillStyle = 'rgba(60,64,72,0.5)'
    for (let x = 4; x < w; x += 8) for (const y of [4, 60, 124, 188]) ctx.fillRect(x, y, 2, 2)
    // Hatch on the left side, scorched band at the heat shield
    ctx.strokeStyle = 'rgba(50,54,60,0.8)'
    ctx.strokeRect(0.75 * w - 34, 110, 68, 90)
    ctx.fillStyle = 'rgba(40,44,52,0.5)'
    ctx.fillRect(0.75 * w - 30, 114, 10, 10)
    const scorch = ctx.createLinearGradient(0, h - 50, 0, h)
    scorch.addColorStop(0, 'rgba(60,45,30,0)')
    scorch.addColorStop(1, 'rgba(60,45,30,0.55)')
    ctx.fillStyle = scorch
    ctx.fillRect(0, h - 50, w, 50)
    drawWindows(ctx, w, '#0a0e16')
  })
  // The cabin lights show through the windows on the night side
  const emissive = paint(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    drawWindows(ctx, w, '#ffc98a')
  })
  return { map, emissive }
}

function serviceModuleTexture() {
  return paint(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#c3c7ce'
    ctx.fillRect(0, 0, w, h)
    // Radiator panels top and bottom, between the solar array mounts
    for (const u of [0, 0.5, 1]) {
      ctx.fillStyle = '#eceef1'
      ctx.fillRect(u * w - 46, 26, 92, 196)
      ctx.strokeStyle = 'rgba(120,126,136,0.5)'
      ctx.lineWidth = 1
      for (let x = u * w - 46; x <= u * w + 46; x += 8) {
        ctx.beginPath()
        ctx.moveTo(x, 26)
        ctx.lineTo(x, 222)
        ctx.stroke()
      }
    }
    ctx.fillStyle = '#2b2f36'
    ctx.fillRect(0, 0, w, 10)
    ctx.fillRect(0, h - 14, w, 14)
    ctx.fillStyle = '#b8402f' // a red stripe, to tell up from down
    ctx.fillRect(0, 12, w, 6)
  })
}

/** Crinkled gold foil: multi-layer insulation round the engine. */
function foilTexture() {
  return paint(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b48632'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * w
      const y = Math.random() * h
      const r = 4 + Math.random() * 14
      const l = 35 + Math.random() * 35
      ctx.fillStyle = `hsla(${38 + Math.random() * 8}, 70%, ${l}%, 0.35)`
      ctx.beginPath()
      ctx.moveTo(x, y)
      for (let k = 0; k < 3; k++) ctx.lineTo(x + (Math.random() - 0.5) * r * 2, y + (Math.random() - 0.5) * r * 2)
      ctx.fill()
    }
  })
}

/** Solar cells in a grid, with the silver lines between them. */
function solarCellTexture() {
  return paint(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#9aa2ae'
    ctx.fillRect(0, 0, w, h)
    const cols = 8
    const rows = 4
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = (i * w) / cols + 2
        const y = (j * h) / rows + 2
        const g = ctx.createLinearGradient(x, y, x + w / cols, y + h / rows)
        g.addColorStop(0, '#16285a')
        g.addColorStop(1, '#0b1636')
        ctx.fillStyle = g
        ctx.fillRect(x, y, w / cols - 4, h / rows - 4)
      }
    }
  })
}

/**
 * Lets the ship fall into eclipse: the Sun's direct light on these materials is scaled by `sunlight`
 * (0 in a planet's shadow, partial in its penumbra), and the scene's ambient fill dimmed, so the ship goes
 * dark but stays just visible.
 */
function eclipsable(material, sunlight) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSunlight = sunlight
    shader.fragmentShader = `uniform float uSunlight;\n${shader.fragmentShader}`.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      reflectedLight.directDiffuse *= uSunlight;
      reflectedLight.directSpecular *= uSunlight;
      reflectedLight.indirectDiffuse *= mix(0.3, 1.0, uSunlight);`,
    )
  }
  return material
}

/** A cylinder along Z from `z0` (front, radius r0) to `z1` (back, radius r1). */
function hullSection(r0, r1, z0, z1, material, openEnded = false) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, z1 - z0, 40, 1, openEnded), material)
  mesh.rotation.x = -Math.PI / 2 // the cylinder's top (r0) toward the nose
  mesh.position.z = (z0 + z1) / 2
  return mesh
}

/** A surface of revolution about Z from `[radius, z]` points, starting at `z`. */
function lathe(points, z, material) {
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), 40), material)
  mesh.rotation.x = Math.PI / 2 // the lathe's +Y toward the tail
  mesh.position.z = z
  return mesh
}

/**
 * The ship's model, about one unit long with the nose toward −Z: a crew capsule with windows, a service
 * module with radiators and two solar array wings, gold-foiled engine bay and engine bell, four attitude
 * thruster quads, a dish antenna and navigation lights. Returns the parts that animate.
 */
function createModel(sunlight) {
  const model = new THREE.Group()
  const capsule = capsuleTextures()
  const material = (options) => eclipsable(new THREE.MeshStandardMaterial(options), sunlight)
  const materials = {
    capsule: material({ map: capsule.map, emissiveMap: capsule.emissive, emissive: '#ffffff', emissiveIntensity: 0.05, metalness: 0.25, roughness: 0.5 }),
    service: material({ map: serviceModuleTexture(), metalness: 0.35, roughness: 0.45 }),
    foil: material({ map: foilTexture(), metalness: 0.6, roughness: 0.4 }),
    dark: material({ color: '#4a4e57', metalness: 0.6, roughness: 0.45 }),
    shield: material({ color: '#5e4e40', metalness: 0.1, roughness: 0.85 }),
    cells: material({ map: solarCellTexture(), metalness: 0.45, roughness: 0.3 }),
    panelBack: material({ color: '#a7adb6', metalness: 0.2, roughness: 0.6 }),
    white: material({ color: '#e4e6ea', metalness: 0.2, roughness: 0.5, side: THREE.DoubleSide }),
    // Heats up and glows orange while the engine fires
    bell: material({ color: '#6a5c4e', metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide, emissive: '#ff5a14', emissiveIntensity: 0 }),
  }

  // Crew capsule, docking adapter on its nose, heat shield behind
  model.add(hullSection(0.07, 0.165, -0.48, -0.2, materials.capsule))
  model.add(hullSection(0.052, 0.062, -0.505, -0.475, materials.dark))
  model.add(hullSection(0.168, 0.168, -0.2, -0.18, materials.shield))
  // Service module, then the foil-wrapped engine bay tapering to the engine
  model.add(hullSection(0.15, 0.15, -0.18, 0.145, materials.service))
  model.add(hullSection(0.15, 0.1, 0.145, 0.215, materials.foil))
  model.add(hullSection(0.055, 0.04, 0.205, 0.235, materials.dark))
  // Engine bell: a flared nozzle, 0.04 wide at the throat to 0.11 at the exit
  const bellProfile = Array.from({ length: 13 }, (_, i) => {
    const t = i / 12
    return [0.035 + 0.075 * t ** 0.6, t * 0.2]
  })
  const bell = lathe(bellProfile, 0.225, materials.bell)
  model.add(bell)

  // Solar array wings, two panels each on a short boom
  const panelMaterials = [materials.dark, materials.dark, materials.cells, materials.panelBack, materials.dark, materials.dark]
  for (const side of [-1, 1]) {
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.075, 8), materials.dark)
    boom.rotation.z = Math.PI / 2
    boom.position.set(side * 0.185, 0, 0)
    model.add(boom)
    for (const x of [0.28, 0.415]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.006, 0.13), panelMaterials)
      panel.position.set(side * x, 0, 0)
      model.add(panel)
    }
  }

  // Dish antenna on a mast, on top of the service module
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 8), materials.dark)
  mast.position.set(0, 0.19, 0.06)
  model.add(mast)
  const dish = new THREE.Mesh(
    new THREE.LatheGeometry(Array.from({ length: 8 }, (_, i) => new THREE.Vector2((i / 7) * 0.045, (i / 7) ** 2 * 0.015)), 24),
    materials.white,
  )
  dish.position.set(0, 0.228, 0.06)
  model.add(dish)

  // Attitude thruster quads round the front of the service module, each with nozzles fore, aft and to the
  // sides, and a puff of exhaust that shows when they fire
  const glow = getGlowTexture()
  const puffs = []
  const nozzleGeometry = new THREE.ConeGeometry(0.007, 0.016, 8)
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2
    const radial = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0)
    const tangent = new THREE.Vector3(-radial.y, radial.x, 0)
    const center = radial.clone().multiplyScalar(0.158).setZ(-0.12)
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.036), materials.dark)
    block.position.copy(center)
    block.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), radial)
    model.add(block)
    for (const dir of [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1), tangent, tangent.clone().negate()]) {
      const nozzle = new THREE.Mesh(nozzleGeometry, materials.dark)
      // The cone's narrow tip into the block, its open end outward
      nozzle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate())
      nozzle.position.copy(center).addScaledVector(dir, 0.024)
      model.add(nozzle)
    }
    const puff = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glow, color: '#dfe8ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    puff.position.copy(center).addScaledVector(radial, 0.04)
    model.add(puff)
    puffs.push(puff)
  }

  // Navigation lights: red to port (left), green to starboard, and a white strobe
  const light = (color, x, y, z) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    sprite.position.set(x, y, z)
    sprite.scale.setScalar(0.022)
    model.add(sprite)
    return sprite
  }
  const lights = {
    port: light(new THREE.Color(1.1, 0.08, 0.06), -0.48, 0, 0),
    starboard: light(new THREE.Color(0.06, 1, 0.2), 0.48, 0, 0),
    strobe: light(new THREE.Color(1.6, 1.6, 1.6), 0, 0.16, -0.26),
  }

  return { model, bell, puffs, lights, bellMaterial: materials.bell }
}

const plumeVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`
const plumeFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float along = vUv.y; // 0 at the nozzle
    // Brightest where the line of sight passes through the middle of the plume
    float depth = pow(abs(dot(normalize(vNormal), normalize(vView))), 1.5);
    float fade = pow(1.0 - along, 2.2);
    float flicker = 0.88 + 0.12 * sin(uTime * 55.0 - along * 24.0);
    gl_FragColor = vec4(uColor * depth * fade * flicker * uIntensity, 1.0);
  }
`

/**
 * The exhaust plume: in vacuum it spreads wide and fades fast, a faint blue cone with a brighter core,
 * rather than the long flame of a rocket in air. Unit length, from the nozzle toward +Z.
 */
function createPlume() {
  const geometry = new THREE.CylinderGeometry(0.4, 0.1, 1, 32, 1, true) // wide end (top) away from the nozzle
  geometry.translate(0, 0.5, 0)
  geometry.rotateX(Math.PI / 2)
  const layer = (color, scale) => {
    const material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(...color) }, uIntensity: { value: 0 }, uTime: { value: 0 } },
      vertexShader: plumeVertex,
      fragmentShader: plumeFragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.scale.set(...scale)
    return mesh
  }
  const plume = new THREE.Group()
  plume.add(layer([0.35, 0.5, 1], [1, 1, 1]), layer([0.8, 0.9, 1.2], [0.5, 0.5, 0.4]))
  return plume
}

/** A line showing where the ship will coast, fading out toward its end. */
function createTrajectory() {
  const positions = new Float32Array(PREDICT_STEPS * 3)
  const colors = new Float32Array(PREDICT_STEPS * 3)
  const base = new THREE.Color('#7fc4ff')
  for (let i = 0; i < PREDICT_STEPS; i++) {
    const fade = (1 - i / PREDICT_STEPS) ** 1.5 * 0.7
    colors.set([base.r * fade, base.g * fade, base.b * fade], i * 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  // Additive, so fading the colour to black fades the line out
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  line.frustumCulled = false
  line.visible = false
  return line
}

const tmpQuaternion = new THREE.Quaternion()
const tmpVector = new THREE.Vector3()
const tmpRel = new THREE.Vector3()

/**
 * A spaceship under gravity. W fires the main engine, A/D yaw, ↑/↓ pitch, Q/E roll, Shift boosts, P and R
 * swing the nose to prograde and retrograde, X holds position. Without flight assist it flies by Newton's
 * laws: it keeps going the way it's moving until the engine burns against that, so it can fall into orbit
 * or slingshot round a planet. It bounces off the Sun, planets and moons, and can land on them.
 */
export class Spaceship {
  constructor() {
    this.group = new THREE.Group()
    this.group.visible = false
    this.sunlight = { value: 1 } // share of the Sun's disc in view, 0 in eclipse
    const parts = createModel(this.sunlight)
    this.model = parts.model
    this.bellMaterial = parts.bellMaterial
    this.puffs = parts.puffs
    this.lights = parts.lights
    this.model.scale.setScalar(SIZE)
    this.group.add(this.model)

    // Exhaust: the plume, and a glow at the nozzle bright enough to feed the bloom pass
    this.plume = createPlume()
    this.plume.position.z = 0.42
    this.model.add(this.plume)
    this.flame = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: new THREE.Color(0.55, 0.8, 1.6),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    this.flame.position.z = SIZE * 0.44
    this.group.add(this.flame)

    this.trajectory = createTrajectory()

    this.velocity = new THREE.Vector3() // relative to the frame: the planet whose pull the ship is in
    this.frame = null // a planet from Gravity, or null for the Sun's
    this.acceleration = new THREE.Vector3()
    this.spin = new THREE.Vector3() // rad/s about the ship's own axes: x pitch, y yaw, z roll
    this.targetSpin = new THREE.Vector3()
    this.assist = readAssist() // flight assist: arcade handling
    this.throttle = 0 // smoothed main engine thrust, −1…2, drives the plume and the sound
    this.rcs = 0 // how hard the attitude thrusters are firing, 0…1
    this.heat = 0 // engine bell glow
    this.boosting = false
    this.holding = false
    this.landed = null // the body the ship is resting on
    this.contactNormal = new THREE.Vector3(0, 1, 0) // the face it last touched
    this.impactSpeed = 0 // how hard it hit something this frame, for the sound
    this.status = 'falling' // 'orbit', 'falling', 'escaping', 'holding' or 'landed', for the HUD
    this.orbit = null // the coasting orbit, from Gravity.orbitAround
    this.time = 0
    this.pressed = new Set()
    this.active = false

    window.addEventListener('keydown', (e) => {
      if (!this.active || !ALL_KEYS.has(e.code) || e.target.matches('input, textarea')) return
      e.preventDefault() // stop the arrows from scrolling or nudging the speed slider
      this.pressed.add(e.code)
    })
    window.addEventListener('keyup', (e) => this.pressed.delete(e.code))
    window.addEventListener('blur', () => this.pressed.clear())
  }

  get position() {
    return this.group.position
  }

  get forward() {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion)
  }

  get up() {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(this.group.quaternion)
  }

  get hitRadius() {
    return HIT_RADIUS
  }

  /** Speed as a share of the top speed with boost, for the HUD and the chase camera. */
  get speedShare() {
    return Math.min(1, this.velocity.length() / BOOST_SPEED)
  }

  /** The body whose pull the ship is in: a planet, or the Sun. */
  get frameBody() {
    return this.frame?.body ?? null
  }

  setAssist(assist) {
    this.assist = assist
    try {
      localStorage.setItem(ASSIST_KEY, assist ? '1' : '0')
    } catch {
      // Storage may be blocked; the setting still holds for this visit
    }
  }

  /** Place the ship at `position`, at rest relative to whatever it's near, pointing at `target`. */
  launch(position, target, gravity) {
    this.group.position.copy(position)
    this.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(position, target, UP))
    this.spin.set(0, 0, 0)
    this.throttle = 0
    this.heat = 0
    this.velocity.set(0, 0, 0)
    this.frame = gravity?.frameAt(position) ?? null
    this.landed = null
    this.pressed.clear()
    this.group.visible = true
    this.trajectory.visible = true
    this.active = true
  }

  park() {
    this.group.visible = false
    this.trajectory.visible = false
    this.active = false
    this.pressed.clear()
  }

  held(action) {
    return KEYS[action].some((code) => this.pressed.has(code))
  }

  /**
   * Ride along with the planet whose pull the ship is in, and switch frames on crossing into or out of a
   * planet's sphere of influence, keeping the ship's true velocity.
   */
  updateFrame(gravity) {
    if (this.frame) this.group.position.add(this.frame.displacement)
    const frame = gravity.frameAt(this.group.position)
    if (frame === this.frame) return
    if (this.frame) this.velocity.add(this.frame.velocity)
    if (frame) this.velocity.sub(frame.velocity)
    this.frame = frame
  }

  /**
   * Turn the ship. The keys set a rotation rate, which the attitude thrusters reach (and stop) at a limited
   * angular acceleration. Returns how hard the thrusters fired, 0…1.
   */
  steer(dt, yaw, pitch, roll) {
    const q = this.group.quaternion
    const target = this.targetSpin.set(pitch * TURN_RATE * 0.7, yaw * TURN_RATE, roll * TURN_RATE)

    // Autopilot: swing the nose along or against the direction of motion, unless the pilot is steering
    const point = this.held('prograde') ? 1 : this.held('retrograde') ? -1 : 0
    if (point && !yaw && !pitch && this.velocity.lengthSq() > 1e-4) {
      const want = tmpVector.copy(this.velocity).normalize().multiplyScalar(point).applyQuaternion(tmpQuaternion.copy(q).invert())
      // Axis from the nose (−Z) to the wanted direction, in the ship's own frame: −Z × want
      const angle = Math.acos(THREE.MathUtils.clamp(-want.z, -1, 1))
      const axis = new THREE.Vector3(want.y, -want.x, 0)
      if (axis.lengthSq() < 1e-10) axis.set(0, 1, 0) // dead ahead or dead behind: either way will do
      axis.normalize().multiplyScalar(Math.min(TURN_RATE, angle * POINT_GAIN))
      target.x = axis.x
      target.y = axis.y
    }
    // Flight assist levels the wings with the planets' orbits whenever the pilot isn't rolling
    if (this.assist && !roll) {
      const right = tmpVector.set(1, 0, 0).applyQuaternion(q)
      target.z = THREE.MathUtils.clamp(-LEVEL_GAIN * right.dot(UP), -TURN_RATE, TURN_RATE)
    }

    const change = target.sub(this.spin)
    const most = SPIN_ACCELERATION * dt
    const size = change.length()
    if (size > most) change.multiplyScalar(most / size)
    this.spin.add(change)
    const angle = this.spin.length() * dt
    if (angle > 0) q.multiply(tmpQuaternion.setFromAxisAngle(tmpVector.copy(this.spin).normalize(), angle)).normalize()
    return most > 0 ? Math.min(1, size / most) : 0
  }

  /**
   * `bodies`: anything with a `position` and `radius` the ship can't fly through; `obstacles`: other
   * colliders (rings, the asteroid belt) with a `collide(ship, from, thickness)` method.
   */
  update(dt, gravity, bodies, obstacles = []) {
    if (!this.active) return
    this.time += dt
    this.impactSpeed = 0
    this.updateFrame(gravity)

    const axis = (a, b) => (this.held(a) ? 1 : 0) - (this.held(b) ? 1 : 0)
    const main = this.held('thrust') ? 1 : 0
    const reverse = this.held('reverse') ? 1 : 0
    this.boosting = this.held('boost') && main > 0
    this.holding = this.held('hold')
    let rcs = this.steer(dt, axis('left', 'right'), axis('up', 'down'), axis('rollLeft', 'rollRight'))

    const v = this.velocity
    v.addScaledVector(gravity.acceleration(this.group.position, this.frame, this.acceleration), dt)
    if (this.holding) {
      // Station keeping: the thrusters cancel motion and gravity, as hard as they can
      const speed = v.length()
      const cut = Math.min(speed, HOLD_ACCELERATION * dt)
      if (speed > 0) v.multiplyScalar(1 - cut / speed)
      rcs = Math.max(rcs, Math.min(1, cut / (HOLD_ACCELERATION * dt)))
    }

    const forward = this.forward
    const power = ACCELERATION * (this.boosting ? BOOST : 1)
    if (this.assist) {
      const thrust = main - reverse * 0.5
      if (thrust !== 0) {
        const ahead = v.dot(forward)
        const limit = this.boosting ? BOOST_SPEED : CRUISE_SPEED
        // The engine pushes only up to the speed limit, and never brakes a ship going faster
        if (thrust > 0 ? ahead < limit : ahead > -limit / 2) v.addScaledVector(forward, thrust * power * dt)
        // Grip: sideways drift dies away while the engine fires
        const sideways = v.clone().addScaledVector(forward, -v.dot(forward))
        v.addScaledVector(sideways, Math.exp(-GRIP * dt) - 1)
      }
    } else {
      if (main) v.addScaledVector(forward, power * dt)
      if (reverse) {
        v.addScaledVector(forward, -RCS_ACCELERATION * dt)
        rcs = 1
      }
    }
    if (v.length() > MAX_SPEED) v.setLength(MAX_SPEED)

    const from = this.group.position.clone()
    this.group.position.addScaledVector(v, dt)
    this.landed = null
    for (const body of bodies) {
      if (this.collide(body, from)) this.landed = body
    }
    for (const obstacle of obstacles) {
      const touched = obstacle.collide(this, from, HIT_RADIUS)
      if (touched) this.landed = touched
    }
    if (this.landed && !main && !(this.assist && reverse)) {
      // Resting on a surface: friction stops it sliding
      const normal = this.contactNormal
      const sliding = v.clone().addScaledVector(normal, -v.dot(normal))
      v.addScaledVector(sliding, Math.exp(-FRICTION * dt) - 1)
    }

    this.updateStatus(gravity)
    this.predict(gravity, obstacles)
    this.updateSunlight(gravity)

    const thrust = this.assist ? main - reverse * 0.5 : main
    this.throttle = THREE.MathUtils.damp(this.throttle, thrust * (this.boosting ? 2 : 1), 8, dt)
    this.rcs = rcs > this.rcs ? rcs : THREE.MathUtils.damp(this.rcs, rcs, 10, dt)
    this.animate(dt)
  }

  /** Plume, nozzle glow, engine heat, thruster puffs and navigation lights. */
  animate(dt) {
    const burn = Math.max(this.throttle, 0)
    this.flame.visible = burn > 0.02
    this.flame.scale.setScalar(SIZE * (0.12 + burn * 0.1) * (1 + Math.random() * 0.15))
    this.flame.material.opacity = Math.min(0.9, burn * 0.9)
    this.plume.visible = burn > 0.02
    // Longer and brighter with thrust; boost (throttle 2) roughly doubles it
    this.plume.scale.set(0.6 + burn * 0.4, 0.6 + burn * 0.4, 0.5 + burn * 1.1)
    for (const layer of this.plume.children) {
      layer.material.uniforms.uIntensity.value = burn * 0.2
      layer.material.uniforms.uTime.value = this.time
    }
    // The bell heats over a few seconds of burning and cools slowly
    this.heat = THREE.MathUtils.damp(this.heat, burn / 2, burn / 2 > this.heat ? 0.6 : 0.3, dt)
    this.bellMaterial.emissiveIntensity = this.heat * 0.6

    for (const puff of this.puffs) {
      // Short, irregular pulses, as the thrusters fire in bursts
      const firing = this.rcs > 0.05 && Math.random() < 0.2 + this.rcs * 0.5
      puff.material.opacity = firing ? this.rcs * (0.25 + Math.random() * 0.35) : 0
      puff.scale.setScalar(0.025 + Math.random() * 0.025)
    }
    // Steady red and green; a double flash of white every 1.5 s
    const t = this.time % 1.5
    this.lights.strobe.visible = t < 0.06 || (t > 0.18 && t < 0.24)
  }

  updateStatus(gravity) {
    this.orbit = gravity.orbitAround(this.frame, this.group.position, this.velocity, HIT_RADIUS)
    if (this.landed) this.status = 'landed'
    else if (this.holding) this.status = 'holding'
    else this.status = this.orbit.status
  }

  /**
   * How much of the Sun's disc the ship can see past the planet whose pull it's in and that planet's moons,
   * from their sizes in the scene: it darkens in their shadows, and on the night side once landed. Other
   * planets are left out: with distances compressed they would cover far more of the Sun than the specks
   * real transits are (Venus, passing near Earth, would hide half of it).
   */
  updateSunlight(gravity) {
    const { sun } = gravity
    const p = this.group.position
    const sunDistance = p.distanceTo(sun.position)
    const sunRadius = Math.asin(Math.min(1, sun.radius / sunDistance))
    const toSun = tmpVector.subVectors(sun.position, p).normalize()
    let light = 1
    for (const body of this.frame ? [this.frame, ...this.frame.moons] : []) {
      const rel = tmpRel.subVectors(body.position, p)
      const d = rel.length()
      if (d <= body.radius || d > sunDistance || rel.dot(toSun) <= 0) continue
      light *= 1 - discCoverage(sunRadius, Math.asin(body.radius / d), rel.angleTo(toSun))
    }
    this.sunlight.value = light
  }

  /** Coast forward under gravity alone (bodies held where they are now) to draw the path ahead. */
  predict(gravity, obstacles) {
    const positions = this.trajectory.geometry.attributes.position
    const p = this.group.position.clone()
    const v = this.velocity.clone()
    const a = new THREE.Vector3()
    const solids = [gravity.sun, ...gravity.planets.flatMap((planet) => [planet, ...planet.moons])]
    let count = 0
    for (; count < PREDICT_STEPS; count++) {
      positions.setXYZ(count, p.x, p.y, p.z)
      if (solids.some((s) => s.position.distanceToSquared(p) < s.radius * s.radius)) break
      v.addScaledVector(gravity.acceleration(p, this.frame, a), PREDICT_STEP)
      const prev = p.clone()
      p.addScaledVector(v, PREDICT_STEP)
      // The rings end the path too (the asteroids are too small and many to be worth it)
      if (count + 1 < PREDICT_STEPS && obstacles.some((o) => o.hit?.(prev, p, 0))) {
        positions.setXYZ(++count, p.x, p.y, p.z)
        count++
        break
      }
    }
    positions.needsUpdate = true
    this.trajectory.geometry.setDrawRange(0, count)
    // Nothing to show while sitting still
    this.trajectory.visible = !this.landed && !this.holding
  }

  /**
   * Stops the ship at the surface of `body`, returning true if it touched. The whole path this frame
   * (`from` to the new position) is tested, not just where it ended up: at full boost the ship covers more
   * than a small moon's width in a frame and would otherwise skip straight through it.
   */
  collide(body, from) {
    const center = body.position
    const minDistance = body.radius + HIT_RADIUS
    const to = this.group.position
    const start = from.clone().sub(center)
    let hit
    if (start.lengthSq() < minDistance * minDistance * 1.0001) {
      hit = to.clone() // already touching, or a moving body ran into the ship: push out from where it is
      if (hit.distanceToSquared(center) >= minDistance * minDistance) return false
    } else {
      // First point where the segment from + t·(to − from), 0 ≤ t ≤ 1, enters the sphere
      const path = to.clone().sub(from)
      const a = path.lengthSq()
      const b = start.dot(path)
      const disc = b * b - a * (start.lengthSq() - minDistance * minDistance)
      if (a === 0 || disc < 0) return false
      const t = (-b - Math.sqrt(disc)) / a
      if (t < 0 || t > 1) return false
      hit = from.clone().addScaledVector(path, t)
    }
    const normal = hit.sub(center).normalize()
    if (normal.lengthSq() === 0) normal.set(0, 1, 0)
    to.copy(center).addScaledVector(normal, minDistance)
    this.bounce(normal)
    return true
  }

  /**
   * After touching a surface facing `normal`: cancel the inward motion, bouncing back a little off hard
   * impacts (gentle ones just settle).
   */
  bounce(normal) {
    this.contactNormal.copy(normal)
    const into = this.velocity.dot(normal)
    if (into < 0) this.impactSpeed = Math.max(this.impactSpeed, -into)
    if (into < 0) this.velocity.addScaledVector(normal, -into * (into < -0.5 ? 1.4 : 1))
  }
}
