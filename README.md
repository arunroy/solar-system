# solar-system

An interactive 3D model of the solar system built with [Three.js](https://threejs.org) and [Vite](https://vite.dev).

## Features

- **Realistic Earth:** NASA satellite imagery shows the real continents by day and city lights at night, with drifting clouds, sunlight glinting off the oceans, and an atmospheric rim. The axis leans the right way, so the seasons fall on the right dates.
- **Real planet maps:** the other planets and the Moon use global maps built from spacecraft data: Mercury's craters, Venus's cloud tops, Mars with Olympus Mons, Valles Marineris and its polar caps, and Jupiter's belts and Great Red Spot. The giant planets darken toward their edges (Minnaert limb darkening), as their hazy upper atmospheres do. A procedural GLSL surface (3D simplex noise) is still available for bodies without imagery.
- **Animated Sun:** a shader surface with granulation and limb darkening, plus a corona and a bloom glow.
- **Saturn's and Uranus's rings:** Saturn's rings come from a real brightness and density profile, including the Cassini division; Uranus's are banded in a shader. Both show the planet's shadow cast across them, and Saturn's rings cast their own shadow back onto the planet. Saturn's axis leans the right way, so the rings turn edge-on to the Sun at the real equinoxes.
- **Real orbital data:** real orbital periods, and axial tilts that point each planet's pole in its real direction in space (Uranus on its side), with retrograde spin for Venus and Uranus. Planets start at roughly their real positions for today's date.
- **Earth's Moon**, tidally locked with its near side facing Earth, and an **asteroid belt** of 2,500 rocks drawn in a single instanced draw call.
- **Time controls:** play and pause, a speed range from 2.4 hours/s to about 2.7 years/s, a jump back to today, and a live simulated date.
- **Click to fly:** select a planet (or the Sun) in the scene, with its label, from the dock, or with keys `0`–`8`. The camera flies to it and follows it along its orbit, and a panel shows facts about it.
- Toggles for orbit lines and labels, and a responsive layout.

Sizes and distances are compressed so everything fits on screen. Periods and tilts are real.

## Getting started

```bash
npm install
npm run dev      # start the dev server at http://localhost:5173
npm run build    # make a production build in dist/
npm run preview  # serve the production build locally
```

## Controls

| Input | Action |
| --- | --- |
| Drag / scroll | Orbit / zoom |
| Click a planet, label or dock button | Fly to it and follow it |
| `0`–`8` | Sun, Mercury … Neptune |
| `Space` | Pause / play |
| `Esc` | Back to overview |

## Project structure

| File | Purpose |
| --- | --- |
| `src/data.js` | Planet data: visual size and distance, real periods, tilts, surface settings and facts |
| `src/SolarSystem.js` | Renderer, bloom, controls, time, picking, camera flights and follow |
| `src/objects/Sun.js` | Sun shader and corona |
| `src/objects/Planet.js` | Planet, rings and moon |
| `src/objects/AsteroidBelt.js` | Instanced asteroid belt |
| `src/objects/Stars.js` | Background starfield |
| `src/shaders/planet.js` | Planet surface shader: image maps or procedural noise |
| `src/shaders/textures.js` | Shared texture loader that tracks loading progress |
| `src/shaders/earth.js` | Earth shader: day and night imagery, clouds, ocean glint |
| `public/textures/` | Planet, Moon and ring imagery |
| `src/main.js` | HUD: info panel, dock, time controls, keyboard shortcuts |

## Image credits

Earth textures are from NASA and are in the public domain:

- Day: [Blue Marble: Next Generation](https://visibleearth.nasa.gov/images/74117) (August 2004), NASA Earth Observatory / Reto Stöckli
- Night: [Earth at Night (Black Marble) 2016](https://visibleearth.nasa.gov/images/144898), NASA Earth Observatory / Joshua Stevens, Miguel Román
- Clouds: [Blue Marble clouds](https://visibleearth.nasa.gov/images/57747), NASA Goddard Space Flight Center

Maps of the other planets, the Moon and Saturn's rings are by [Solar System Scope](https://www.solarsystemscope.com/textures/), based on NASA mission data, and are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). They are used unmodified, renamed (for example `2k_mars.jpg` → `mars.jpg`).
