import * as THREE from 'three'
import { simplexNoise3D, fbm3D } from '../shaders/noise.js'
import { createLabel, getGlowTexture } from './helpers.js'

const vertexShader = /* glsl */ `
  varying vec3 vObj;
  varying vec3 vNormal;
  varying vec3 vView;

  void main() {
    vObj = normalize(position);
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;

  varying vec3 vObj;
  varying vec3 vNormal;
  varying vec3 vView;

  ${simplexNoise3D}
  ${fbm3D}

  void main() {
    float n = fbm(vObj * 3.0 + vec3(0.0, uTime * 0.03, 0.0));
    float granules = snoise(vObj * 24.0 + uTime * 0.15) * 0.5 + 0.5;

    vec3 color = mix(uColorA, uColorB, smoothstep(-0.5, 0.4, n));
    color = mix(color, uColorC, smoothstep(0.2, 0.9, n + granules * 0.3));

    // Limb darkening: the edge of the disc looks dimmer than the centre
    float limb = max(dot(vNormal, vView), 0.0);
    color *= 0.65 + 0.35 * limb;

    // Values above 1.0 feed the bloom pass
    gl_FragColor = vec4(color * 2.2, 1.0);
  }
`

export class Sun {
  constructor(data) {
    this.data = data
    this.id = data.id
    this.radius = data.radius
    this.group = new THREE.Group()

    this.uniforms = {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color('#ff4d00') },
      uColorB: { value: new THREE.Color('#ffa21f') },
      uColorC: { value: new THREE.Color('#fff1c1') },
    }
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius, 96, 48),
      new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: this.uniforms }),
    )
    this.mesh.userData.body = this
    this.group.add(this.mesh)
    this.hitTarget = this.mesh

    const corona = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: '#ff9a3c',
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    corona.scale.setScalar(this.radius * 4.5)
    this.group.add(corona)

    this.label = createLabel(this)
    this.group.add(this.label)
  }

  get position() {
    return this.group.position
  }

  update(days, dtDays, dt, elapsed) {
    this.uniforms.uTime.value = elapsed
    this.mesh.rotation.y += dt * 0.02
  }
}
