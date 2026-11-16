# Taichung MINI Drive

A browser driving game built with three.js: drive a cartoon-style MINI hatchback through downtown Taichung, Taiwan, picking up a passenger and getting her to her destination before she runs out of patience. The roads and street furniture are generated from OpenStreetMap data, and the distant skyline follows the real terrain.

Status: milestone M1 in progress. The playable area ("range A") runs from Taichung Station to the Seventh Redevelopment Zone.

## Getting started

Requirements: Node.js 22, Python 3, and Google Chrome (only for browser tests and screenshot tools).

```bash
npm install
npm run dev
```

Open http://localhost:5173 and press any key to start.

## How to play

Each round, Cici appears somewhere on the map and asks for a ride. Follow the arrow and the minimap marker, and stop next to her to pick her up. She then names a destination; stop there to finish the round.

- Her impatience rises over time. If it reaches 100%, the round fails.
- Picking her up halves her impatience.
- Hitting other cars, walls or poles adds impatience.
- A successful round earns respect, which makes her impatience rise more slowly in later rounds. A failed round costs a little respect.

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
| `?mode=free` | Free drive, without the pick-up game |
| `?traffic=off` | No other cars on the road |
| `?trees=on` / `?scooters=on` | Bring back street trees / parked scooters (hidden by default) |
| `?bld=old` | Previous building facade style |
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
- Road widths, building footprints with floor counts and street trees: Taichung City Government ([road widths](https://data.gov.tw/dataset/83822), [buildings 2025 edition](https://data.gov.tw/dataset/158889), [street trees](https://data.gov.tw/dataset/109853)), Open Government Data License, version 1.0. Building heights come from the recorded floor counts; OpenStreetMap buildings are kept only for landmarks, named places, metro stations and buildings missing from the government map.
- The elevated metro line and the named places (department stores, hotels, stations) are positioned from OpenStreetMap; their signs show names only and the buildings are simplified stand-ins.
- Terrain: Taiwan Ministry of the Interior 20 m DTM (Open Government Data License, version 1.0).
- The car, tree and street light models were generated with Tripo AI.

This is a fan project. It is not affiliated with or endorsed by BMW or MINI.
