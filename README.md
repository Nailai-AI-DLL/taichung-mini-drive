# Taichung MINI Drive

A browser driving game built with three.js: cruise a cartoon-style MINI hatchback through downtown Taichung, Taiwan. The city (roads, buildings, street furniture) is generated from OpenStreetMap data, and the distant skyline follows the real terrain.

Status: milestone M1 in progress. The playable area ("range A") runs from Taichung Station to the Seventh Redevelopment Zone.

## Getting started

Requirements: Node.js 22, Python 3, and Google Chrome (only for browser tests and screenshot tools).

```bash
npm install
npm run dev
```

Open http://localhost:5173 and press any key to start.

| Key | Action |
|---|---|
| W / ↑ | Throttle |
| S / ↓ | Brake, then reverse |
| A D / ← → | Steer |
| Space | Handbrake (drift) |
| R | Reset to the nearest road |
| C | Cycle camera: chase / close chase / first person / top-down |
| M | Toggle minimap |
| ` | Handling tuning panel |
| Esc | Pause |

URL options:

| Option | Effect |
|---|---|
| `?fps` | Show the frame rate |
| `?props=gen` | Use the procedural trees and street lights instead of the 3D models |
| `?car=gen` | Use the procedural car |
| `?carstyle=pbr` | Use realistic car materials instead of the toon style |
| `?hud=a` / `?hud=b` | Alternative HUD themes |

## Map data

The built map for range A (`public/map/range-a/`) is committed, so the game runs without downloading anything. To rebuild it, use the scripts below. They download the raw data into `data/`, which is not version-controlled.

```bash
npm run map:fetch:range-a    # download raw OSM data from Overpass
npm run map:build:range-a    # build public/map/range-a/world.json
npm run map:skyline:range-a  # build the distant mountain skyline from the 20 m DTM
```

## Tests

```bash
npm test           # unit tests (vitest)
npm run test:e2e   # browser smoke and performance test (opens Chrome)
```

## Project layout

| Path | Contents |
|---|---|
| `src/` | Game runtime: map streaming, physics (Rapier), vehicle, camera, rendering, HUD |
| `tools/map-build/` | Map build pipeline (OSM to game data) |
| `tools/models/` | Blender scripts for preparing 3D models |
| `tools/shots/`, `tools/dev/` | Screenshot and handling measurement tools |
| `tests/` | Unit and end-to-end tests |
| `docs/` | Design decisions and milestone reports (Traditional Chinese) |

## Credits

- Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL.
- Terrain: Taiwan Ministry of the Interior 20 m DTM (Open Government Data License, version 1.0).
- The car, tree and street light models were generated with Tripo AI.

This is a fan project. It is not affiliated with or endorsed by BMW or MINI.
