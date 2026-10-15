import * as THREE from 'three'
import { simplexNoise3D, fbm3D } from './noise.js'
import { loadTexture } from './textures.js'

// Surfaces are either real imagery ('map': an equirectangular image, see README) or procedural
// ('rocky', 'gas'): noise sampled on the unit sphere in object space, with no seams or downloads.
// The Sun sits at the world origin.

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vObj;
  varying vec3 vNormal;
  varying vec3 vWorld;

  void main() {
    vUv = uv;
    vObj = normalize(position);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const fragmentShader = /* glsl */ `
  uniform int uType;
  uniform sampler2D uMap;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform vec3 uColorD;
  uniform float uSeed;
  uniform float uTime;
  uniform float uBands;
  uniform float uTurb;
  uniform float uIce;
  uniform vec4 uSpot; // lat (rad), lon (rad), size, strength
  uniform vec3 uAtmoColor;
  uniform float uAtmo;
  uniform float uMinnaert; // limb darkening exponent k: 1 = plain Lambert, > 1 darkens toward the limb
  // Shadow cast by a ring image (see Planet.createRings): plane through the planet centre, world units
  uniform float uRingShadow;
  uniform sampler2D uRingMap;
  uniform vec3 uRingCenter;
  uniform vec3 uRingNormal;
  uniform vec2 uRingRadii; // inner, outer

  varying vec2 vUv;
  varying vec3 vObj;
  varying vec3 vNormal;
  varying vec3 vWorld;

  ${simplexNoise3D}
  ${fbm3D}

  vec3 rocky(vec3 p) {
    float n = fbm(p * 2.2 + uSeed);
    float detail = fbm(p * 9.0 + uSeed * 1.7);
    vec3 c = mix(uColorA, uColorB, smoothstep(-0.45, 0.35, n));
    c = mix(c, uColorC, smoothstep(0.15, 0.6, detail) * 0.6);
    float craters = smoothstep(0.55, 0.75, snoise(p * 22.0 + uSeed));
    c *= 1.0 - craters * 0.25;
    if (uIce > 0.0) {
      float ice = smoothstep(1.0 - uIce, 1.0 - uIce + 0.04, abs(p.y) + detail * 0.05);
      c = mix(c, uColorD, ice);
    }
    return c;
  }

  vec3 gas(vec3 p) {
    float turb = fbm(p * vec3(1.5, 4.0, 1.5) + uSeed);
    float band = sin(p.y * uBands + turb * uTurb);
    vec3 c = mix(uColorA, uColorB, band * 0.5 + 0.5);
    float fine = fbm(p * vec3(2.0, 18.0, 2.0) + uSeed * 3.0);
    c = mix(c, uColorC, smoothstep(0.0, 0.6, fine) * 0.5);
    if (uSpot.w > 0.0) {
      vec3 dir = vec3(cos(uSpot.y) * cos(uSpot.x), sin(uSpot.x), sin(uSpot.y) * cos(uSpot.x));
      vec3 d = p - dir;
      d.y *= 1.8; // storms are stretched along latitude
      float spot = 1.0 - smoothstep(uSpot.z * 0.4, uSpot.z, length(d) + turb * 0.03);
      c = mix(c, uColorD, spot * uSpot.w);
    }
    return c;
  }

  void main() {
    vec3 color = uType == 2 ? texture2D(uMap, vUv).rgb : uType == 0 ? rocky(vObj) : gas(vObj);

    vec3 N = normalize(vNormal);
    vec3 L = normalize(-vWorld);
    vec3 V = normalize(cameraPosition - vWorld);
    float NdotL = dot(N, L);

    // Rings: follow the ray toward the Sun to the ring plane and dim sunlight by the ring density there
    float sunlight = 1.0;
    float denom = dot(L, uRingNormal);
    if (uRingShadow > 0.5 && abs(denom) > 1e-4) {
      float t = dot(uRingCenter - vWorld, uRingNormal) / denom;
      float r = length(vWorld + L * t - uRingCenter);
      float u = (r - uRingRadii.x) / (uRingRadii.y - uRingRadii.x);
      if (t > 0.0 && u > 0.0 && u < 1.0) sunlight -= texture2D(uRingMap, vec2(u, 0.5)).a * 0.85;
    }

    // Minnaert reflectance: mu0^k * mu^(k-1). Gas giants' hazy upper atmospheres dim their limbs
    float NdotV = max(dot(N, V), 1e-3);
    float diffuse = pow(max(NdotL, 0.0), uMinnaert) * pow(NdotV, uMinnaert - 1.0);

    vec3 lit = color * (0.02 + diffuse * 1.05 * sunlight);

    // Atmospheric rim light, only on the day side and the terminator
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    lit += uAtmoColor * fresnel * uAtmo * smoothstep(-0.2, 0.5, NdotL);

    gl_FragColor = vec4(lit, 1.0);
  }
`

const TYPES = { rocky: 0, gas: 1, map: 2 } // Earth has its own material in earth.js

export function createPlanetMaterial(surface) {
  const color = (hex) => new THREE.Color(hex ?? '#000000')
  const colors = surface.colors ?? []
  const spot = surface.spot
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uType: { value: TYPES[surface.type] },
      uMap: { value: surface.map ? loadTexture(surface.map) : null },
      uColorA: { value: color(colors[0]) },
      uColorB: { value: color(colors[1]) },
      uColorC: { value: color(colors[2]) },
      uColorD: { value: color(colors[3]) },
      uSeed: { value: surface.seed ?? 0 },
      uTime: { value: 0 },
      uBands: { value: surface.bands ?? 10 },
      uTurb: { value: surface.turbulence ?? 2 },
      uIce: { value: surface.ice ?? 0 },
      uSpot: {
        value: spot
          ? new THREE.Vector4(THREE.MathUtils.degToRad(spot.lat), spot.lon, spot.size, spot.strength)
          : new THREE.Vector4(),
      },
      uAtmoColor: { value: color(surface.atmosphere?.color) },
      uAtmo: { value: surface.atmosphere?.strength ?? 0 },
      uMinnaert: { value: surface.limbDarkening ?? 1 },
      uRingShadow: { value: 0 },
      uRingMap: { value: null },
      uRingCenter: { value: new THREE.Vector3() },
      uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
      uRingRadii: { value: new THREE.Vector2() },
    },
  })
}
