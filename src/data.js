// Scene units are compressed for viewing: `radius` and `distance` are visual, not to scale.
// Orbital periods are real (Earth days), and `L0` is each planet's mean longitude at J2000
// in degrees, so planets sit at roughly their real heliocentric longitude for the shown date.
// Rotation periods are real (hours) but sped down visually. `tilt` is the obliquity of the right-hand-rule
// pole and `poleLongitude` is the heliocentric ecliptic longitude it leans toward (from the IAU pole RA/Dec),
// so a tilt over 90° (Venus, Uranus) is what makes the spin retrograde; periods are never negative.
// Moon counts are as of 2025 and change as new moons are confirmed.

export const sun = {
  id: 'sun',
  name: 'Sun',
  kind: 'G-type main-sequence star',
  color: '#ffb02e',
  radius: 5,
  description:
    'The star at the centre of our solar system, holding 99.8% of its mass. Its core fuses about 600 million tonnes of hydrogen into helium every second.',
  facts: [
    ['Diameter', '1,392,700 km'],
    ['Surface temperature', '≈ 5,500 °C'],
    ['Core temperature', '≈ 15 million °C'],
    ['Rotation', '≈ 25 days at the equator'],
    ['Age', '≈ 4.6 billion years'],
  ],
}

export const planets = [
  {
    id: 'mercury',
    name: 'Mercury',
    kind: 'Terrestrial planet',
    color: '#a39b92',
    radius: 0.38,
    distance: 9,
    au: 0.387, // real semi-major axis, for the Sun's apparent size in eclipses
    radiusKm: 2439.7,
    period: 87.969,
    rotationHours: 1407.6,
    tilt: 0.03,
    poleLongitude: 318.2,
    L0: 252.2503,
    surface: { type: 'map', map: 'textures/mercury.jpg' },
    description:
      'The smallest planet and the closest to the Sun. With almost no atmosphere, its surface swings from about 430 °C by day to −180 °C at night.',
    facts: [
      ['Diameter', '4,879 km'],
      ['Distance from Sun', '57.9 million km (0.39 AU)'],
      ['Year', '88 Earth days'],
      ['Rotation', '58.6 Earth days'],
      ['Axial tilt', '0.03°'],
      ['Moons', '0'],
    ],
  },
  {
    id: 'venus',
    name: 'Venus',
    kind: 'Terrestrial planet',
    color: '#e8d3a2',
    radius: 0.95,
    distance: 12.5,
    au: 0.723, // real semi-major axis, for the Sun's apparent size in eclipses
    radiusKm: 6051.8,
    period: 224.701,
    rotationHours: 5832.5,
    tilt: 177.4,
    poleLongitude: 210.2, // opposite the IAU north pole (λ 30.2°), which Venus spins backwards around
    L0: 181.9791,
    // Venus's cloud tops, not the radar-mapped ground hidden beneath them
    surface: { type: 'map', map: 'textures/venus_atmosphere.jpg', atmosphere: { color: '#ffd9a0', strength: 0.6 } },
    description:
      'Similar in size to Earth but wrapped in thick clouds of sulfuric acid. A runaway greenhouse effect makes it the hottest planet, at about 465 °C, and it spins backwards.',
    facts: [
      ['Diameter', '12,104 km'],
      ['Distance from Sun', '108.2 million km (0.72 AU)'],
      ['Year', '225 Earth days'],
      ['Rotation', '243 Earth days (retrograde)'],
      ['Axial tilt', '177.4°'],
      ['Moons', '0'],
    ],
  },
  {
    id: 'earth',
    name: 'Earth',
    kind: 'Terrestrial planet',
    color: '#4f9bff',
    radius: 1,
    distance: 17,
    au: 1, // real semi-major axis, for the Sun's apparent size in eclipses
    radiusKm: 6371,
    period: 365.256,
    rotationHours: 23.934,
    tilt: 23.44,
    // Heliocentric longitude the north pole leans toward, so seasons fall on the right dates
    // (northern summer at the June solstice, when Earth is at longitude 270° and the Sun lies at 90°)
    poleLongitude: 90,
    // Sunlight reddened and bent into Earth's shadow by its atmosphere: the "blood moon" of a total lunar eclipse
    shadowGlow: '#8a2a0c',
    L0: 100.4645,
    surface: {
      type: 'earth',
      textures: {
        day: 'textures/earth_day.jpg',
        night: 'textures/earth_night.jpg',
        clouds: 'textures/earth_clouds.jpg',
      },
      atmosphere: { color: '#5fa8ff', strength: 1.2 },
    },
    moons: [
      {
        name: 'Moon',
        id: 'moon',
        kind: 'Moon of Earth',
        color: '#c9c9c9',
        description:
          "Earth's only natural satellite, probably formed from debris after a Mars-sized body struck the young Earth. It always shows Earth the same face, and the dark plains on that near side are ancient lava flows.",
        facts: [
          ['Diameter', '3,475 km'],
          ['Distance from Earth', '384,400 km'],
          ['Orbit', '27.3 days'],
          ['Orbital tilt', '5.1° to the ecliptic'],
          ['Surface gravity', "16.5% of Earth's"],
        ],
        radiusKm: 1737.4,
        orbitKm: 384400,
        radius: 0.27,
        distance: 2.2,
        ephemeris: 'lunar', // its own orbit and node, from the lunar theory in ephemeris.js
        period: 27.321661,
        equatorial: false, // the Moon's orbit is tilted 5.1° to the ecliptic, not to Earth's equator
        surface: { type: 'map', map: 'textures/moon.jpg', brightness: 0.65 },
      },
    ],
    description: 'Our home, and the only world known to host life. About 71% of its surface is covered by liquid water.',
    facts: [
      ['Diameter', '12,756 km'],
      ['Distance from Sun', '149.6 million km (1 AU)'],
      ['Year', '365.25 days'],
      ['Rotation', '23 h 56 min'],
      ['Axial tilt', '23.4°'],
      ['Moons', '1'],
    ],
  },
  {
    id: 'mars',
    name: 'Mars',
    kind: 'Terrestrial planet',
    color: '#d9824a',
    radius: 0.55,
    distance: 22,
    au: 1.524, // real semi-major axis, for the Sun's apparent size in eclipses
    radiusKm: 3389.5,
    period: 686.98,
    rotationHours: 24.623,
    tilt: 25.19,
    poleLongitude: 352.9,
    L0: 355.4533,
    surface: { type: 'map', map: 'textures/mars.jpg', atmosphere: { color: '#ff9a6a', strength: 0.35 } },
    description:
      'A cold desert world coloured red by iron oxide. It has polar ice caps and the tallest volcano in the solar system, Olympus Mons.',
    facts: [
      ['Diameter', '6,792 km'],
      ['Distance from Sun', '227.9 million km (1.52 AU)'],
      ['Year', '687 Earth days'],
      ['Rotation', '24 h 37 min'],
      ['Axial tilt', '25.2°'],
      ['Moons', '2'],
    ],
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    kind: 'Gas giant',
    color: '#e9d6b5',
    radius: 2.8,
    distance: 36,
    au: 5.203, // real semi-major axis, for the Sun's apparent size in eclipses
    radiusKm: 69911,
    period: 4332.59,
    rotationHours: 9.925,
    tilt: 3.13,
    poleLongitude: 247.8,
    L0: 34.3964,
    surface: { type: 'map', map: 'textures/jupiter.jpg', limbDarkening: 1.2, atmosphere: { color: '#ffe2b8', strength: 0.3 } },
    // The Galilean moons: radii true to scale against Jupiter, real periods, orbits compressed to fit.
    // The maps' brightness is arbitrary, so it is rescaled to keep the real albedo order, compressed so
    // nothing clips: Moon < Callisto < Ganymede < Io < Europa, about 15% apart where the real albedos are close.
    // Io's frost patches and Europa's ice are kept dim enough not to cross the bloom threshold and glare.
    // Europa, Ganymede and Callisto have greyscale maps: `mapMean` is each map's mean grey (measured in
    // linear light; it also fills the polar no-data gaps) and `tint` the moon's average colour
    moons: [
      {
        name: 'Io',
        id: 'io',
        kind: 'Moon of Jupiter',
        color: '#e8c95a',
        description:
          'The most volcanically active world known, with over 400 active volcanoes. Tides from Jupiter flex and heat its interior, and sulfur compounds paint its surface yellow, orange and red.',
        facts: [
          ['Diameter', '3,643 km'],
          ['Distance from Jupiter', '421,700 km'],
          ['Orbit', '1.77 days'],
          ['Discovered', '1610, Galileo Galilei'],
        ],
        radiusKm: 1821.6,
        orbitKm: 421700,
        radius: 0.073,
        distance: 4.8,
        L0: 18.158,
        period: 1.7691378,
        surface: { type: 'map', map: 'textures/io.jpg', brightness: 1.6 },
      },
      {
        name: 'Europa',
        id: 'europa',
        kind: 'Moon of Jupiter',
        color: '#e6dccb',
        description:
          "An ice-covered moon with a global ocean of salty water beneath its cracked shell, holding perhaps twice as much water as Earth's oceans. It is one of the most promising places to look for life beyond Earth.",
        facts: [
          ['Diameter', '3,122 km'],
          ['Distance from Jupiter', '671,034 km'],
          ['Orbit', '3.55 days'],
          ['Discovered', '1610, Galileo Galilei'],
        ],
        radiusKm: 1560.8,
        orbitKm: 671034,
        radius: 0.0625,
        distance: 5.9,
        L0: 212.765,
        period: 3.5511810,
        surface: { type: 'map', map: 'textures/europa.jpg', tint: '#c0bcb4', mapMean: '#989898' },
      },
      {
        name: 'Ganymede',
        id: 'ganymede',
        kind: 'Moon of Jupiter',
        color: '#bdb6aa',
        description:
          'The largest moon in the solar system, bigger than the planet Mercury, and the only moon known to make its own magnetic field. Dark, ancient terrain alternates with younger bright, grooved ice.',
        facts: [
          ['Diameter', '5,268 km'],
          ['Distance from Jupiter', '1,070,412 km'],
          ['Orbit', '7.15 days'],
          ['Discovered', '1610, Galileo Galilei'],
        ],
        radiusKm: 2634.1,
        orbitKm: 1070412,
        radius: 0.1055,
        distance: 7.3,
        L0: 220.069,
        period: 7.1545530,
        surface: { type: 'map', map: 'textures/ganymede.jpg', tint: '#aaa6a0', mapMean: '#525252' },
      },
      {
        name: 'Callisto',
        id: 'callisto',
        kind: 'Moon of Jupiter',
        color: '#a89d8c',
        description:
          'One of the most heavily cratered surfaces in the solar system: an ancient ball of ice and rock that has barely changed in four billion years. Bright craters stand out against its dark crust.',
        facts: [
          ['Diameter', '4,821 km'],
          ['Distance from Jupiter', '1,882,709 km'],
          ['Orbit', '16.7 days'],
          ['Discovered', '1610, Galileo Galilei'],
        ],
        radiusKm: 2410.3,
        orbitKm: 1882709,
        radius: 0.0965,
        distance: 9.2,
        L0: 79.161,
        period: 16.689018,
        surface: { type: 'map', map: 'textures/callisto.jpg', tint: '#999187', mapMean: '#404040' },
      },
    ],
    description:
      'The largest planet, more than twice as massive as all the others combined. Its Great Red Spot is a storm wider than Earth.',
    facts: [
      ['Diameter', '142,984 km'],
      ['Distance from Sun', '778.5 million km (5.2 AU)'],
      ['Year', '11.9 Earth years'],
      ['Rotation', '9 h 56 min'],
      ['Axial tilt', '3.1°'],
      ['Moons', '95'],
    ],
  },
  {
    id: 'saturn',
    name: 'Saturn',
    kind: 'Gas giant',
    color: '#ead7a4',
    radius: 2.4,
    distance: 48,
    au: 9.537, // real semi-major axis, for the Sun's apparent size in eclipses
    radiusKm: 58232,
    period: 10759.22,
    rotationHours: 10.656,
    tilt: 26.73,
    // North pole at ecliptic longitude ≈ 79.5°, so the rings turn edge-on to the Sun (equinox) at the
    // right times, most recently in May 2025, and their shadow falls on the right hemisphere
    poleLongitude: 79.5,
    L0: 49.9554,
    surface: { type: 'map', map: 'textures/saturn.jpg', limbDarkening: 1.2, atmosphere: { color: '#ffeccc', strength: 0.3 } },
    // The ring image runs from 1.19 to 2.33 Saturn radii: C ring, B ring, Cassini division, A ring
    rings: { inner: 1.19, outer: 2.33, map: 'textures/saturn_ring.png' },
    moons: [
      {
        // Titan's thick orange haze hides its surface in visible light, so it is drawn as smooth haze
        name: 'Titan',
        id: 'titan',
        kind: 'Moon of Saturn',
        color: '#e0a35a',
        description:
          "Saturn's largest moon, wrapped in a thick orange haze of nitrogen and methane. Beneath it lie rivers, lakes and seas of liquid methane and ethane, the only surface liquids known beyond Earth.",
        facts: [
          ['Diameter', '5,150 km'],
          ['Distance from Saturn', '1,221,870 km'],
          ['Orbit', '15.9 days'],
          ['Surface pressure', "1.5 × Earth's"],
          ['Discovered', '1655, Christiaan Huygens'],
        ],
        radiusKm: 2574.7,
        orbitKm: 1221870,
        radius: 0.106,
        distance: 8.5,
        L0: 137.124,
        period: 15.945446,
        surface: {
          type: 'gas',
          colors: ['#c08445', '#cc9350', '#d09856'],
          bands: 3,
          turbulence: 0.4,
          seed: 4.2,
          atmosphere: { color: '#e8a85a', strength: 1 },
        },
      },
    ],
    description: 'A gas giant famous for its bright rings of ice and rock. It is the only planet less dense than water.',
    facts: [
      ['Diameter', '120,536 km'],
      ['Distance from Sun', '1.43 billion km (9.5 AU)'],
      ['Year', '29.4 Earth years'],
      ['Rotation', '10 h 39 min'],
      ['Axial tilt', '26.7°'],
      ['Moons', '274'],
    ],
  },
  {
    id: 'uranus',
    name: 'Uranus',
    kind: 'Ice giant',
    color: '#a6e6ea',
    radius: 1.6,
    distance: 59,
    au: 19.19, // real semi-major axis, for the Sun's apparent size in eclipses
    radiusKm: 25362,
    period: 30688.5,
    rotationHours: 17.24,
    tilt: 97.77,
    poleLongitude: 77.6, // opposite the IAU north pole (λ 257.6°), which Uranus spins backwards around
    L0: 313.2381,
    surface: { type: 'map', map: 'textures/uranus.jpg', limbDarkening: 1.35, atmosphere: { color: '#bff6ff', strength: 0.8 } },
    rings: { inner: 1.5, outer: 2.0, colors: ['#6f8a8f', '#a9c4c7'], opacity: 0.3 },
    description:
      'An ice giant tipped on its side, with an axial tilt of about 98°. Each pole gets around 42 years of continuous sunlight followed by 42 years of darkness.',
    facts: [
      ['Diameter', '51,118 km'],
      ['Distance from Sun', '2.87 billion km (19.2 AU)'],
      ['Year', '84 Earth years'],
      ['Rotation', '17 h 14 min (retrograde)'],
      ['Axial tilt', '97.8°'],
      ['Moons', '29'],
    ],
  },
  {
    id: 'neptune',
    name: 'Neptune',
    kind: 'Ice giant',
    color: '#5b82f0',
    radius: 1.55,
    distance: 69,
    au: 30.07, // real semi-major axis, for the Sun's apparent size in eclipses
    radiusKm: 24622,
    period: 60182,
    rotationHours: 16.11,
    tilt: 28.32,
    poleLongitude: 319.2,
    L0: 304.88,
    surface: { type: 'map', map: 'textures/neptune.jpg', limbDarkening: 1.3, atmosphere: { color: '#6f9bff', strength: 1 } },
    description:
      'The most distant planet: a deep-blue ice giant with the fastest winds in the solar system, topping 2,000 km/h.',
    facts: [
      ['Diameter', '49,528 km'],
      ['Distance from Sun', '4.5 billion km (30.1 AU)'],
      ['Year', '165 Earth years'],
      ['Rotation', '16 h 7 min'],
      ['Axial tilt', '28.3°'],
      ['Moons', '16'],
    ],
  },
]

export const asteroidBelt = {
  inner: 26,
  outer: 30.5,
  count: 2500,
  period: 1680, // ≈ 4.6 years, typical for the main belt
}
