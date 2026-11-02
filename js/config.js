// Voxelit! — central settings. Everything that points at an outside service lives here.
export const CONFIG = {
    VOXEL_SIZE: 5,                       // metres per voxel for generated areas
    AREA_SIZES: [500, 1000, 2000],       // selectable square side lengths (m)
    DEFAULT_AREA: 1000,
    MAX_AREA: 2000,

    // Buildings: OSM height → metres. Tiles only give one "render_height" number, see voxelize.js
    METERS_PER_LEVEL: 3,
    DEFAULT_LEVELS: 2,                   // building with no height and no levels in OSM

    // Trees (no global height data in the browser yet): canopy height range, metres
    TREE_MIN_M: 10,
    TREE_MAX_M: 15,

    // --- data sources (all free, no API key) ---
    // OpenFreeMap: OSM vector tiles in the OpenMapTiles schema (buildings, water, land cover)
    VECTOR_TILEJSON: 'https://tiles.openfreemap.org/planet',
    VECTOR_ZOOM: 14,
    MAP_STYLE: 'https://tiles.openfreemap.org/styles/liberty',
    // Terrain: Mapzen/Tilezen Terrarium elevation tiles on AWS Open Data
    DEM_URL: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    DEM_ZOOM: 13,
    // The elevation tiles are a surface model (SRTM-based): houses and trees raise them by several metres.
    // We turn it into bare-earth terrain: remove bumps narrower than ~2×DTM_REMOVE_M, then smooth.
    DTM_REMOVE_M: 150,
    DTM_SMOOTH_M: 100,
    // Trees & grass: read from satellite imagery (green pixels; dark green = tree canopy, light green = grass).
    // Same free tiles as the viewer's basemap; no key, no proxy. Set to '' to use OpenStreetMap parks/woods only.
    VEG_IMAGERY_URL: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    VEG_MAX_TILES: 36,                   // imagery zoom drops until the area needs at most this many tiles
    // vegetation classification (see vegetation() in the worker). Raise exgr / fraction for less green.
    VEG: { exgr: 0.05, exg: 0.06, minGreen: 35, fraction: 0.6, treeDark: 80, treeTexture: 16, treeBright: 125 },
    // Place search
    GEOCODER: 'https://nominatim.openstreetmap.org',

    SAMPLE_CITIES: [
        { id: 'jakarta',   name: 'Jakarta',   place: 'Monas',              lat: -6.17540, lon: 106.82720 },
        { id: 'berlin',    name: 'Berlin',    place: 'Brandenburger Tor',  lat: 52.51630, lon: 13.37770 },
        { id: 'london',    name: 'London',    place: 'Westminster',        lat: 51.50070, lon: -0.12460 },
        { id: 'barcelona', name: 'Barcelona', place: 'Sagrada Família',    lat: 41.40360, lon: 2.17440 },
        { id: 'tokyo',     name: 'Tokyo',     place: 'Shibuya Crossing',   lat: 35.65950, lon: 139.70050 },
        { id: 'seoul',     name: 'Seoul',     place: 'Gwanghwamun',        lat: 37.57590, lon: 126.97680 },
        { id: 'singapore', name: 'Singapore', place: 'Marina Bay',         lat: 1.28340,  lon: 103.86070 },
        { id: 'beijing',   name: 'Beijing',   place: 'Tiananmen',          lat: 39.90550, lon: 116.39760 },
    ],
};

// Same class names and order as Voxel-FT-UGM's tools, plus 'road' at the end (older viewers simply skip it)
export const TYPES = ['ground', 'river', 'building', 'building_roof', 'tree_low', 'tree_high', 'road'];
export const COLORS = {
    ground: '#8D6E63', river: '#29B6F6', building: '#E0E0E0',
    building_roof: '#D32F2F', tree_low: '#8BC34A', tree_high: '#2E7D32', road: '#4B5563',
};

// Build a viewer URL for a place
export function viewUrl({ lat, lon, size = CONFIG.DEFAULT_AREA, name }) {
    const q = new URLSearchParams({ lat: (+lat).toFixed(5), lon: (+lon).toFixed(5), size: String(size) });
    if (name) q.set('name', name);
    return `view.html?${q}`;
}
