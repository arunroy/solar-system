# solar-system

An interactive 3D model of the solar system built with [Three.js](https://threejs.org) and [Vite](https://vite.dev).

## Features

- **Procedural planets:** every surface is generated in GLSL from 3D simplex noise, so there are no texture downloads and no seams. This covers rocky worlds with craters and polar ice, banded gas giants with storms (Jupiter's Great Red Spot), and Earth with oceans, continents, ice caps and drifting clouds.
- **Animated Sun:** a shader surface with granulation and limb darkening, plus a corona and a bloom glow.
- **Saturn's and Uranus's rings:** shader rings with banding, the Cassini division, and the planet's shadow cast across them.
- **Real orbital data:** real orbital periods, axial tilts (Uranus on its side) and retrograde spin (Venus, Uranus). Planets start at roughly their real positions for today's date.
- **Earth's Moon** and an **asteroid belt** of 2,500 rocks drawn in a single instanced draw call.
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
| `src/shaders/planet.js` | Procedural planet surface shader |
| `src/main.js` | HUD: info panel, dock, time controls, keyboard shortcuts |
