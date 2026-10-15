import * as THREE from 'three'
import { loadTexture } from './textures.js'
import { eclipseShadow, createEclipseUniforms } from './eclipses.js'

// Earth uses real NASA imagery (public domain, see README) instead of procedural noise:
// Blue Marble for the day side, Black Marble city lights for the night side, and a global cloud map.

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;

  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uClouds;
  uniform float uTime;
  uniform vec3 uAtmoColor;
  uniform float uAtmo;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;

  ${eclipseShadow}

  void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(-vWorld); // the Sun is at the origin
    vec3 V = normalize(cameraPosition - vWorld);
    float NdotL = dot(N, L);
    vec3 sunlight = eclipseLight(vWorld, L); // the Moon's shadow during a solar eclipse
    float sunShare = dot(sunlight, vec3(0.2126, 0.7152, 0.0722));
    float daylight = smoothstep(-0.12, 0.2, NdotL) * sunShare; // soft terminator (twilight band)

    vec3 surface = texture2D(uDay, vUv).rgb;
    float cloud = smoothstep(0.12, 0.85, texture2D(uClouds, vUv + vec2(uTime * 0.0015, 0.0)).r);

    // Oceans in Blue Marble are dark and blue-dominant: use that as a water mask for sun glint
    float ocean = smoothstep(0.0, 0.015, surface.b - max(surface.r, surface.g) * 1.1);

    vec3 color = mix(surface, vec3(1.0), cloud * 0.9);
    vec3 lit = color * (0.015 + max(NdotL, 0.0) * 1.1 * sunlight);

    vec3 H = normalize(L + V);
    float glint = pow(max(dot(N, H), 0.0), 60.0) * ocean * (1.0 - cloud) * step(0.0, NdotL) * sunShare;
    lit += vec3(1.0, 0.92, 0.8) * glint * 0.5;

    // City lights on the night side (and under the Moon's shadow); the warm channel isolates lights from
    // Black Marble's blue land tint
    vec3 night = texture2D(uNight, vUv).rgb;
    float cityMask = smoothstep(0.02, 0.25, night.r);
    lit += night * cityMask * (1.0 - daylight) * (1.0 - cloud * 0.75) * 1.6;

    // Atmospheric rim, brightest along the day side and the terminator
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    lit += uAtmoColor * fresnel * uAtmo * smoothstep(-0.2, 0.5, NdotL) * sunlight;

    gl_FragColor = vec4(lit, 1.0);
  }
`

export function createEarthMaterial(surface) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uDay: { value: loadTexture(surface.textures.day) },
      uNight: { value: loadTexture(surface.textures.night) },
      uClouds: { value: loadTexture(surface.textures.clouds, { color: false }) },
      uTime: { value: 0 },
      uAtmoColor: { value: new THREE.Color(surface.atmosphere.color) },
      uAtmo: { value: surface.atmosphere.strength },
      ...createEclipseUniforms(),
    },
  })
}
