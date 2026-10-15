import * as THREE from 'three'

// Eclipse shadows cast by spheres: a moon on its planet, or the planet on its moons.
// Scene distances are compressed (the Moon orbits at 2.2 Earth radii), so a geometrically exact shadow would
// be far too big and hard-edged. Instead each occluder carries `ratio`, its real angular size divided by the
// Sun's as seen from the receiver, and the shadow is the real fraction of the Sun's disc it covers, scaled
// to the occluder's size in the scene. The Moon (ratio ≈ 0.97) casts a soft penumbra with a barely total
// core; Jupiter seen from Io (ratio ≈ 185) casts a sharp-edged umbra. An occluder's glow is the light its
// atmosphere bends into the shadow: Earth's makes the totally eclipsed Moon a dim red.

export const MAX_OCCLUDERS = 4
const SUN_RADIUS_KM = 696_000
const AU_KM = 149_597_871

/** Ratio of an occluder's angular radius to the Sun's, at a real distance from the receiver. */
export function occluderRatio(radiusKm, distanceKm, au) {
  return radiusKm / distanceKm / (SUN_RADIUS_KM / (au * AU_KM))
}

export function createEclipseUniforms() {
  return {
    uOccluders: { value: Array.from({ length: MAX_OCCLUDERS }, () => new THREE.Vector4()) }, // centre, radius
    uOccluderRatios: { value: new Array(MAX_OCCLUDERS).fill(0) },
    uOccluderGlows: { value: Array.from({ length: MAX_OCCLUDERS }, () => new THREE.Color(0, 0, 0)) },
    uOccluderCount: { value: 0 },
  }
}

export const eclipseShadow = /* glsl */ `
  uniform vec4 uOccluders[${MAX_OCCLUDERS}];
  uniform float uOccluderRatios[${MAX_OCCLUDERS}];
  uniform vec3 uOccluderGlows[${MAX_OCCLUDERS}];
  uniform int uOccluderCount;

  // Fraction of a disc of radius r1 covered by a disc of radius r2 whose centre is x away
  float discCoverage(float r1, float r2, float x) {
    if (x >= r1 + r2) return 0.0;
    if (x <= abs(r2 - r1)) return min(1.0, (r2 * r2) / (r1 * r1));
    float a = r1 * r1 * acos(clamp((x * x + r1 * r1 - r2 * r2) / (2.0 * x * r1), -1.0, 1.0));
    float b = r2 * r2 * acos(clamp((x * x + r2 * r2 - r1 * r1) / (2.0 * x * r2), -1.0, 1.0));
    float c = 0.5 * sqrt(max(0.0, (-x + r1 + r2) * (x + r1 - r2) * (x - r1 + r2) * (x + r1 + r2)));
    return (a + b - c) / (3.14159265 * r1 * r1);
  }

  // Sunlight reaching P, per colour channel (the Sun is at the origin, L is the unit vector toward it)
  vec3 eclipseLight(vec3 P, vec3 L) {
    vec3 light = vec3(1.0);
    for (int i = 0; i < ${MAX_OCCLUDERS}; i++) {
      if (i >= uOccluderCount) break;
      vec4 occ = uOccluders[i];
      vec3 toCenter = occ.xyz - P;
      float along = dot(toCenter, L);
      if (along <= 0.0) continue; // occluder is behind P, away from the Sun
      float miss = length(toCenter - L * along);
      // Measure in units of the Sun's apparent radius, scaled so the occluder keeps its real size ratio
      float sunRadius = occ.w / uOccluderRatios[i];
      light *= mix(vec3(1.0), uOccluderGlows[i], discCoverage(1.0, uOccluderRatios[i], miss / sunRadius));
    }
    return light;
  }
`
