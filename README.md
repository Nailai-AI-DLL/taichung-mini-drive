# Taichung MINI Drive

A browser driving game built with three.js: drive a cartoon-style MINI hatchback through downtown Taichung, Taiwan, picking up a passenger and getting her to her destination before she runs out of patience. Roads, buildings, street trees and signals are generated from OpenStreetMap and Taichung City Government open data, and the ground follows the real terrain.

Status: milestone M1 in progress. The playable area ("range A", about 8.2 × 8.0 km) covers Taichung Station, the Seventh Redevelopment Zone, Fengjia, Shuinan, Beitun and the Highway 74 corridor.

## Getting started

Requirements: Node.js 22, Python 3, and Google Chrome (only for browser tests and screenshot tools).

```bash
npm install
npm run map:pull   # download the built map from the map-data branch (required once after cloning)
npm run dev
```

Open http://localhost:5173 and choose a mode on the title screen: **Free explore** (key 1) or **Pick up Cici** (key 2).

The built map is not on `main`: it lives on the orphan `map-data` branch, and `npm run map:pull` copies it into `public/map/range-a/` (ignored by git). Without it the game shows a loading error.

## How to play

There are two modes. In **Free explore** you drive anywhere and can fast-travel from the full map. In **Pick up Cici** the full map is view-only (no fast travel). Each round, Cici appears somewhere on the map and asks for a ride. Follow the arrow and the minimap marker, and stop next to her to pick her up. She then names a destination; stop there to finish the round.

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
| M | Open the full map (in Free explore, click a spot to fast-travel there) |
| N | Toggle night mode |
| ` | Handling tuning panel |
| Esc | Pause (the pause menu also has **Back to title** to switch modes) |

URL options:

| Option | Effect |
|---|---|
| `?fps` | Show the frame rate |
| `?mode=free` | Default mode for scripts calling `__game.start()` (the title screen still asks) |
| `?traffic=off` | No other cars on the road |
| `?night=1` | Start in night mode |
| `?trees=off` / `?scooters=on` | Hide street trees / bring back parked scooters (hidden by default) |
| `?terrain=off` | Flat ground instead of the 3D terrain |
| `?tiles=off` | Load the whole map at once (`world.json`) instead of streaming 1 km tiles |
| `?mapUrl=<url>` | Load the map from another location |
| `?bld=old` | Previous building facade style |
| `?props=tripo` | Use the older Tripo tree and street light models |
| `?car=gen` | Use the procedural car |
| `?carstyle=pbr` | Use realistic car materials instead of the toon style |
| `?hud=a` / `?hud=b` | Alternative HUD themes |

## Map data

Players and most development only need `npm run map:pull` (see Getting started). Rebuilding the map needs the raw data in `data/` (not version-controlled) and runs in this order:

```bash
npm run map:fetch:range-a      # 1. raw OSM data from Overpass (plus tools/map-build/fetch-range-a-nodes.sh)
#                                 2. government data: download by hand, see docs/research/data-sources.md
npm run map:widths:range-a     # 3. match government road widths to OSM ways
npm run map:lanes:range-a      # 4. match lane counts and speed limits
npm run map:build:range-a      # 5. build public/map/range-a/world.json
npm run map:tile:range-a       # 6. split into index.json + 1 km tiles
npm run map:elevation:range-a  # 7. terrain heights from the 20 m DTM
npm run map:skyline:range-a    # 8. distant mountain skyline
npm run map:push               # 9. publish to the map-data branch
```

The data sources, dataset IDs and download steps are listed in `docs/research/data-sources.md`.

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
- Road widths, lane counts and speed limits, building footprints with floor counts, and street trees: Taichung City Government ([road widths](https://data.gov.tw/dataset/83822), [1/1000 road map 2025 edition](https://data.gov.tw/dataset/162899), [buildings 2025 edition](https://data.gov.tw/dataset/158889), [street trees](https://data.gov.tw/dataset/109853)), Open Government Data License, version 1.0. Building heights come from the recorded floor counts; OpenStreetMap buildings are kept only for landmarks, named places, metro stations and buildings missing from the government map.
- The elevated metro line and the named places (department stores, hotels, stations) are positioned from OpenStreetMap; their signs show names only and the buildings are simplified stand-ins.
- Terrain: Taiwan Ministry of the Interior 20 m DTM (Open Government Data License, version 1.0).
- The car, street trees and street light models were generated with Tripo AI. The landmark buildings are made with Blender scripts in `tools/models/`.

This is a fan project. It is not affiliated with or endorsed by BMW or MINI.
