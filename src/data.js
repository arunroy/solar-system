// Scene units are compressed for viewing: `radius` and `distance` are visual, not to scale.
// Orbital periods are real (Earth days), and `L0` is each planet's mean longitude at J2000
// in degrees, so planets sit at roughly their real heliocentric longitude for the shown date.
// Rotation periods are real (hours; negative = retrograde) but sped down visually.
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
    period: 87.969,
    rotationHours: 1407.6,
    tilt: 0.03,
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
    period: 224.701,
    rotationHours: -5832.5,
    tilt: 177.4,
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
    period: 365.256,
    rotationHours: 23.934,
    tilt: 23.44,
    // Heliocentric longitude the north pole leans toward, so seasons fall on the right dates
    // (northern summer at the June solstice, when Earth is at longitude 270° and the Sun lies at 90°)
    poleLongitude: 90,
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
    moon: {
      radius: 0.27,
      distance: 2.2,
      period: 27.32,
      surface: { type: 'map', map: 'textures/moon.jpg' },
    },
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
    period: 686.98,
    rotationHours: 24.623,
    tilt: 25.19,
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
    period: 4332.59,
    rotationHours: 9.925,
    tilt: 3.13,
    L0: 34.3964,
    surface: { type: 'map', map: 'textures/jupiter.jpg', atmosphere: { color: '#ffe2b8', strength: 0.3 } },
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
    period: 10759.22,
    rotationHours: 10.656,
    tilt: 26.73,
    // North pole at ecliptic longitude ≈ 79.5°, so the rings turn edge-on to the Sun (equinox) at the
    // right times, most recently in May 2025, and their shadow falls on the right hemisphere
    poleLongitude: 79.5,
    L0: 49.9554,
    surface: { type: 'map', map: 'textures/saturn.jpg', atmosphere: { color: '#ffeccc', strength: 0.3 } },
    // The ring image runs from 1.19 to 2.33 Saturn radii: C ring, B ring, Cassini division, A ring
    rings: { inner: 1.19, outer: 2.33, map: 'textures/saturn_ring.png' },
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
    period: 30688.5,
    rotationHours: -17.24,
    tilt: 97.77,
    L0: 313.2381,
    surface: { type: 'map', map: 'textures/uranus.jpg', atmosphere: { color: '#bff6ff', strength: 0.8 } },
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
    period: 60182,
    rotationHours: 16.11,
    tilt: 28.32,
    L0: 304.88,
    surface: { type: 'map', map: 'textures/neptune.jpg', atmosphere: { color: '#6f9bff', strength: 1 } },
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
