# Voxelit! — any city on Earth, in voxels

Pick a spot anywhere on Earth and Voxelit! builds a 0.5–2 km square of it in **5 m voxels**, from open data,
entirely in the browser (no server), then lets you explore and simulate it: **daylight & shadows**,
**weather & air quality** and **wind** (Open-Meteo), **roads with simulated cars** (OpenStreetMap), **fire spread** (cellular
automaton), a draped **basemap**, and **orbit / first-person / third-person-as-a-cat** views.
The simulation modules come from Voxel-FT-UGM (v2-fire) and now work for any location.

## Run it
Plain HTML/CSS/JS (ES modules + a module Web Worker), so it needs to be served over http, not opened as a file:

```
python -m http.server 8000      # then open http://localhost:8000
```

GitHub Pages works as-is (push the folder, enable Pages). Needs a recent browser
(Chrome/Edge 80+, Firefox 114+, Safari 16.4+).

## Pages
| Page | What it does |
|---|---|
| `index.html` | Welcome: eight sample cities (Jakarta, Berlin, London, Barcelona, Tokyo, Seoul, Singapore, Beijing), *Find your city*, *Open a .vxl.gz file* |
| `explore.html` | Globe map (MapLibre), place search, click to place a 0.5 / 1 / 2 km square, *Build voxels* |
| `view.html?lat=…&lon=…&size=1000` | Generates the area, then the full viewer: This Area (stats, download, share), View Mode, Time & Sun, Weather & Air Quality, Wind, Traffic, Fire Spread, Basemap, Cat Avatar. Links are shareable. |
| `view.html?upload=1` | Opens a `.vxl.gz` (Voxelit or Voxel-FT-UGM VXL1/VXL2 files) — drag & drop also works |

## Files
```
js/config.js                 all settings and data-source URLs (voxel size, area sizes, height rules, sample cities)
js/explore.js                world map, search, area picker
js/view-boot.js              viewer start-up: generate / open the area, set location + time zone, load js/sim/*
js/sim/*.js                  the simulation viewer (three.js r128, from Voxel-FT-UGM v2-fire):
                             config, voxel-grid, main (scene + voxel layers), geo, sky (sun), weather, wind, rain,
                             fire, cats, cat-maker (new), player (1st / 3rd person), basemap, cars (new), minimap, touch
css/sim.css                  viewer styles
js/worker/generate.worker.js downloads data for the square and runs the pipeline off the main thread
js/lib/mvt.js                vector-tile decoder (no dependency)
js/lib/raster.js             polygon / line rasterising onto the grid
js/lib/voxelize.js           map data → voxel columns, surface model → bare-earth terrain (pure functions)
js/lib/vxl.js                .vxl.gz read / write
js/lib/geo.js, js/isoart.js  tile maths; the little isometric towns on the welcome page
```

## Data and rules
| Layer | Source | Rule |
|---|---|---|
| Buildings, water, rivers, parks, woods | OpenStreetMap via **OpenFreeMap** vector tiles (OpenMapTiles schema, z14) | Height: OSM `height` if tagged; otherwise **levels × 3 m**; otherwise **2 levels (6 m)**, counted as "estimated". Each building cell stands on the ground of that cell. |
| Terrain | **Terrarium** elevation tiles (AWS Open Data, z13) | These are a *surface* model (SRTM-based): houses and trees add several metres. A morphological opening (100 m window) + smoothing turns it into bare-earth terrain (`toTerrain()` in voxelize.js), then ground height in 5 m steps; water one step below the bank. |
| Trees & grass | **Esri World Imagery** tiles (the same ones as the basemap), classified in the browser | Vegetation index **ExGR = ExG − ExR** on chromatic coordinates (Meyer & Neto 2008), which ignores the greenish haze of grey roofs and asphalt. A 5 m cell is vegetated when ≥ 60 % of its 3×3 samples are, isolated cells are dropped; dark or textured → tree canopy (10–15 m), bright and smooth → grass. Thresholds in `CONFIG.VEG` (raise `exgr` or `fraction` for less green). |
| Roads & bridges | OSM `transportation` layer of the same vector tiles | Paved as `road` voxels (width by road class). Bridges over water become a deck level with the nearest banks, above the water. The network is kept in the file for the car simulation. |

Every source fails soft: if terrain or imagery can't be reached the area is still built (flat ground / OSM-only trees) and the viewer shows a warning.

**About building heights.** The vector tiles carry one number, `render_height`, which the tile builder sets to
`ceil(height)`, `ceil(levels × 3.66)` or `5` (no data). `voxelize.js → buildingHeight()` reverses that to apply the
3 m-per-level rule. Note also that the tile builder merges touching buildings at this zoom, so "Footprints" counts merged blocks, not individual houses. Values that happen to equal `ceil(n × 3.66)` (4, 8, 11, 15…) are read as levels, so a building
genuinely tagged `height=8` becomes 6 m — small, but worth knowing. Using the raw OSM tags (Overpass) or Overture
would remove this ambiguity later.

## File format
Same `VXL2` layout as `tools/compress_voxels.py` in Voxel-FT-UGM (header, type names, `uint8` grid with
`index = (x·nz + z)·ny + y`, gzipped), class names `ground, river, building, building_roof, tree_low, tree_high`.
Voxelit appends an optional footer after the voxels — `"GEO1"` + `uint32` length + JSON (centre lon/lat, area,
voxel size, ground elevation, sources). The Voxel-FT-UGM reader stops after the voxels, so it still opens these
files (it will note that the voxel size is 5 m instead of 2 m).

Axes: x = east, y = up, z = south, grid centred on the chosen lon/lat.

## Limits
- Max area 2 km (400 × 400 columns). Larger areas would need chunked loading.
- Nominatim (search / place names) allows about 1 request per second; the search box is debounced.
- OSM data is © OpenStreetMap contributors (ODbL); the attribution is shown in the viewer and stored in each file.
- Esri World Imagery is offered for viewing; deriving trees from it is fine for a non-commercial academic site, but
  check Esri's terms before any commercial use (set `VEG_IMAGERY_URL` to another imagery source or `''` to skip).

## Simulation notes (what changed from Voxel-FT-UGM)
- **Location:** `CONFIG.GEOREF`, the spawn point (area centre) and the voxel size are set per area by `view-boot.js`.
  Files without a location (original FT UGM files) fall back to FT UGM and say so.
- **Time zone:** first guessed from the longitude, then replaced by Open-Meteo's `utc_offset_seconds` /
  `timezone_abbreviation`, so "Live" shows the local clock anywhere.
- **5 m voxels:** jump height is raised to clear one block; terrain steps are climbed automatically; fog and sun
  distance scale with the area size. The HUD shows real elevation above sea level.
- **Removed:** flood simulation, the Legend & Layers panel, TomTom traffic and the WorldCover proxy — no keys anywhere.
- **Roads & cars (new, `js/sim/cars.js`):** no API. The road network from OpenStreetMap is stored in each
  `.vxl.gz` footer; cars wander it at typical speeds per road class, split at junctions, follow one-way streets,
  keep left or right according to the country (from Nominatim's country code), and switch on headlights at night.
- **Cats:** the panel now fills in correctly when the scripts load late, adds a **Sad** face, and **Create your own**
  (`js/sim/cat-maker.js`): pattern (solid / stripes / points / patches), colour pickers for base, pattern, patches,
  belly and eyes, any of the seven faces — or **Give your face!**, a PNG/JPG photo mapped onto the front of the head
  with zoom and position controls. Make as many cats as you like; each card has ✎ edit and 🗑 delete (delete is
  also in the editor). Saved in the browser (localStorage), nothing is uploaded.

## Viewer tools, dialogs and Your places
- **Header:** ⌂ Home and World map buttons.
- **Toolbar (right, under the compass):** ⟳ automatic orbit rotation (frame-rate independent, about one turn per
  40 s), 📷 screenshot (PNG with a caption bar: place, coordinates, local time; also key **P**), ☆ save place.
- **Your places:** ☆ (or *Save place* in This Area) stores the area — name, coordinates, size and a small picture —
  in this browser (`localStorage`, `js/places.js`). The home page lists them under **Your places** (open, rename,
  remove) and the world map shows them as ★ chips. Areas opened from a file can't be saved, since they are not
  rebuilt from a link.
- **Dialogs:** confirmations and prompts use SweetAlert2 in the site's dark style (`js/dialog.js`, `css/dialog.css`);
  if the library can't load, the browser's own dialog is used so nothing breaks.
- **Sample city cards:** each shows a small voxel model of its landmark (Monas, Brandenburger Tor, Big Ben, Sagrada
  Família, Shibuya Crossing, Gwanghwamun, Marina Bay Sands, Tiananmen) on a city-coloured sky, plus the country flag,
  all drawn as SVG in `js/isoart.js` — no photos to license or download.

## Next steps
1. Individual buildings with exact height tags (Overpass / Overture) instead of the merged map-tile footprints.
2. Google Open Buildings 2.5D heights for the Global South.
