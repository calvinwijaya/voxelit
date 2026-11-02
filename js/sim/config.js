// =====================================================================
//  CONFIG — everything you may want to tune lives here
// =====================================================================
window.CONFIG = {
    // Filled in by js/view-boot.js for every area before the other scripts run:
    //   VOXEL_SIZE (m), GEOREF (centre of the grid), PLAYER.spawn, TIMEZONE_OFFSET_H / TZ_LABEL.
    VOXEL_SIZE: 5,
    // Scene orientation used everywhere (sun, compass, wind, basemap): +X = East, -Z = North, +Y = Up
    GEOREF: { lat: -7.7652, lon: 110.3725, rotationDeg: 0, offsetE: 0, offsetN: 0, flipZ: false },

    COLORS: {
        ground: '#8D6E63', river: '#29B6F6', building: '#E0E0E0',
        building_roof: '#D32F2F', tree_low: '#8BC34A', tree_high: '#2E7D32', road: '#4B5563',
        background: '#FFFFFF'
    },
    LABELS: {
        ground: 'Ground Terrain', river: 'River Area', tree_low: 'Low Vegetation',
        tree_high: 'High Vegetation', building: 'Building Wall', building_roof: 'Building Roof', road: 'Road'
    },

    // ---- Walk modes ----
    PLAYER: {
        spawn: { lat: -7.7652, lon: 110.3725, headingDeg: null },   // set to the area centre; heading null = face the centre
        fpEyeHeight: 1.6,        // human eye height in first person (m)
        jumpHeight: 2.8          // m — raised to clear one voxel when voxels are bigger (view-boot.js)
    },

    // ---- Sky / time ----
    TIMEZONE_OFFSET_H: 7,        // replaced by the area's own offset (estimate from longitude, then Open-Meteo)
    TZ_LABEL: 'UTC+7',
    SKY: { day: '#e6f0fa', golden: '#ffb58a', twilight: '#3b4372', night: '#070b1f', overcast: '#9aa3ad' },

    // ---- Weather & air quality (Open-Meteo, free, no key) ----
    WEATHER: {
        refreshMinutes: 15,
        forecastURL: 'https://api.open-meteo.com/v1/forecast',
        airURL: 'https://air-quality-api.open-meteo.com/v1/air-quality',
        // Optional: a free WAQI token (https://aqicn.org/data-platform/token/) adds the nearest
        // monitoring-station reading next to the model estimate. Leave '' to skip.
        waqiToken: '',
        rainDrops: 7000
    },


    // ---- Fire model (cellular automaton, Alexandridis et al. 2008 style) ----
    FIRE: {
        flammability: {          // relative ignition probability
            tree_high: 1.0, tree_low: 0.85, building_roof: 0.35,
            building: 0.15, ground: 0.0, river: 0.0
        },
        burnSteps: {             // how many steps a voxel keeps burning
            tree_high: 8, tree_low: 3, building_roof: 12, building: 18, ground: 2, river: 0
        },
        consumed: { tree_high: true, tree_low: true },  // burnt voxels disappear
        baseProbability: 0.22,   // p_h: ignition prob. per step to a face neighbour
        windC1: 0.045,           // wind constants (Alexandridis): p_w = e^(c1 V) e^(c2 V (cosθ-1))
        windC2: 0.131,
        upwardFactor: 2.2,       // flames climb faster than they descend
        downwardFactor: 0.35,
        emberMinWind: 5,         // m/s — above this, burning canopy throws embers downwind
        emberChance: 0.015
    },

    // ---- Live wind ----
    WIND: {
        refreshMinutes: 15,      // Open-Meteo "current" data updates every 15 min
        particles: 2500,
        roughnessZ0: 1.0         // aerodynamic roughness (m), urban ≈ 1
    },

    // ---- Cars (simulated on the OpenStreetMap road network) ----
    CARS: {
        maxCars: 600,            // at 100 % density (half on phones)
        leftHand: false          // set per area from the country (view-boot.js)
    },

    // ---- Basemap ----
    BASEMAPS: {
        none: null,
        satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' },
        osm: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' },
        light: { url: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors © CARTO' },
        dark: { url: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors © CARTO' }
    },
    BASEMAP_ZOOM: 17,
    BASEMAP_EXTENT: 3.0           // basemap plane size relative to the voxel area
};

