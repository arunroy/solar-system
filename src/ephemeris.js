// Where each moon is on its orbit for a given date, as an orbital longitude in the J2000 ecliptic frame:
// counted from the equinox along the ecliptic to the node of the orbit's plane, then along the orbit.
// Each planet's axial tilt is a rotation about that node line, so the same angle places a moon in its
// planet's tilted equatorial frame (Planet.js).
//
// - Earth's Moon: the largest terms of the lunar theory (Meeus, Astronomical Algorithms, ch. 47), ≈ 0.3°.
// - Moons with `L0` and `period`: mean longitude at J2000 plus mean motion. The Galilean moons come from
//   Meeus ch. 44 and Titan from ch. 46 (their B1950 longitudes precessed to J2000); periodic terms of up to
//   ≈ 1° (3° for Titan's eccentric orbit) are left out, which compressed orbits can't show anyway.

const DEG = Math.PI / 180
const sin = (deg) => Math.sin(deg * DEG)
// Precession in longitude since J2000 (degrees per Julian century), to bring "of date" angles to J2000
const PRECESSION = 1.3969713

/** Earth's Moon: ecliptic longitude, and the node and inclination of its orbit (degrees, J2000). */
export function lunarOrbit(days) {
  const T = days / 36525
  const L = 218.3164477 + 13.17639648 * days // mean longitude
  const D = 297.8501921 + 12.19074912 * days // mean elongation from the Sun
  const M = 357.5291092 + 0.98560028 * days // Sun's mean anomaly
  const Mm = 134.9633964 + 13.06499295 * days // Moon's mean anomaly
  const F = 93.272095 + 13.22935024 * days // argument of latitude
  const longitude =
    L +
    6.289 * sin(Mm) + // equation of the centre
    1.274 * sin(2 * D - Mm) + // evection
    0.658 * sin(2 * D) + // variation
    0.214 * sin(2 * Mm) -
    0.186 * sin(M) - // annual equation
    0.114 * sin(2 * F)
  return {
    longitude: longitude - PRECESSION * T,
    node: L - F - PRECESSION * T, // the node regresses once every 18.6 years
    inclination: 5.145,
  }
}

/** A moon's orbit for the date: longitude, plus node and inclination when its orbit isn't equatorial. */
export function moonOrbit(moon, days) {
  if (moon.ephemeris === 'lunar') return lunarOrbit(days)
  return { longitude: moon.L0 + (360 * days) / moon.period, node: 0, inclination: 0 }
}
