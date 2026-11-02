// Turns map data (already in grid coordinates) into a voxel grid. Pure function: no network.
import { fillPolygon, drawLine } from './raster.js';
import { hash2 } from './geo.js';
import { TYPES } from '../config.js';

const T = Object.fromEntries(TYPES.map((t, k) => [t, k + 1]));       // name → stored byte
// surface classes
const BARE = 0, GRASS = 1, SHRUB = 2, TREE = 3, WATER = 4, ROAD = 5;

// vegetation classes read from imagery (worker) → surface class
const VEG = { 1: GRASS, 2: TREE };

/**
 * OpenMapTiles "render_height" → metres, following our rule of 3 m per level.
 * The tile generator (Planetiler/OpenMapTiles) stores ceil(height) when OSM has a height,
 * ceil(levels × 3.66) when it only has levels, and 5 when it has neither — so we undo that.
 */
export function buildingHeight(props, cfg) {
    const h = Number(props.render_height);
    if (!Number.isFinite(h) || h <= 0 || h === 5) return { h: cfg.DEFAULT_LEVELS * cfg.METERS_PER_LEVEL, estimated: true };
    for (let lv = 1; lv <= 200; lv++) {
        const c = Math.ceil(lv * 3.66);
        if (c === h) return { h: lv * cfg.METERS_PER_LEVEL, estimated: false, levels: lv };
        if (c > h) break;
    }
    return { h, estimated: false };
}

// sliding-window min / max / mean along rows then columns (separable, edges clamped)
function filter2(src, n, r, op) {
    const tmp = new Float32Array(n * n), out = new Float32Array(n * n);
    const pass = (a, b, stride, step) => {
        for (let line = 0; line < n; line++) for (let k = 0; k < n; k++) {
            let acc = op === 'min' ? Infinity : op === 'max' ? -Infinity : 0, cnt = 0;
            for (let d = Math.max(0, k - r); d <= Math.min(n - 1, k + r); d++) {
                const v = a[line * stride + d * step];
                if (op === 'min') { if (v < acc) acc = v; } else if (op === 'max') { if (v > acc) acc = v; } else { acc += v; cnt++; }
            }
            b[line * stride + k * step] = op === 'mean' ? acc / cnt : acc;
        }
    };
    pass(src, tmp, n, 1);       // rows   (line = j, k = i)
    pass(tmp, out, 1, n);       // columns (line = i, k = j)
    return out;
}

/**
 * Surface model → bare-earth terrain: a morphological opening (min then max filter) removes bumps narrower than
 * the window — buildings and tree crowns — then two box blurs take out the 30 m pixel steps.
 */
export function toTerrain(dsm, n, V, cfg) {
    const r = Math.max(1, Math.round((cfg.DTM_REMOVE_M ?? 60) / V));
    const s = Math.max(1, Math.round((cfg.DTM_SMOOTH_M ?? 60) / V / 2));
    let t = filter2(filter2(dsm, n, r, 'min'), n, r, 'max');
    t = filter2(filter2(t, n, s, 'mean'), n, s, 'mean');
    return t;
}

/**
 * @param n        cells per side
 * @param V        voxel size (m)
 * @param feats    { buildings:[{rings,h,minH,estimated}], water:[rings], waterways:[{line,width}],
 *                   wood:[rings], grass:[rings], roads:[{line,width}] }   — all in fractional grid units
 * @param elev     Float32Array(n*n) metres (or null = flat)
 * @param cover    Uint8Array(n*n) vegetation from imagery: 0 none, 1 grass, 2 tree (or null)
 */
export function voxelize({ n, V, feats, elev, cover, cfg }) {
    const N = n * n;
    const surf = new Uint8Array(N);
    const stats = { buildings: 0, estimated: 0, buildingCells: 0, treeCells: 0, waterCells: 0, grassCells: 0, roadCells: 0 };

    // 1. land cover: imagery first, then OSM polygons on top (OSM is more detailed in cities)
    if (cover) for (let c = 0; c < N; c++) surf[c] = VEG[cover[c]] ?? BARE;
    for (const rings of feats.grass) fillPolygon(rings, n, (i, j) => { const c = j * n + i; if (surf[c] !== TREE) surf[c] = GRASS; });
    for (const rings of feats.wood) fillPolygon(rings, n, (i, j) => { surf[j * n + i] = TREE; });
    for (const rings of feats.water) fillPolygon(rings, n, (i, j) => { surf[j * n + i] = WATER; });
    for (const w of feats.waterways) drawLine(w.line, w.width / V / 2, n, (i, j) => { surf[j * n + i] = WATER; });
    // roads pave over grass and trees; over water, bridges become a deck above the water (step 4)
    const bridge = new Uint8Array(N);
    for (const r of feats.roads || []) drawLine(r.line, r.width / V / 2, n, (i, j) => {
        const c = j * n + i;
        if (surf[c] !== WATER) surf[c] = ROAD; else if (r.bridge) bridge[c] = 1;
    });

    // 2. ground height in voxels (≥ 1 layer everywhere)
    const g = new Int16Array(N).fill(1);
    let minE = 0, maxE = 0;
    if (elev) {
        minE = Infinity; maxE = -Infinity;
        for (let c = 0; c < N; c++) { if (elev[c] < minE) minE = elev[c]; if (elev[c] > maxE) maxE = elev[c]; }
        const scale = Math.min(1, 300 / Math.max(1e-6, (maxE - minE) / V));   // keep extreme relief under 300 voxels
        for (let c = 0; c < N; c++) g[c] = 1 + Math.round((elev[c] - minE) / V * scale);
    }
    for (let c = 0; c < N; c++) if (surf[c] === WATER) g[c] = Math.max(1, g[c] - 1);   // water sits a step below the bank

    // 3. buildings stand on the ground of each cell. (A flat base at the lowest point of the footprint
    //    sank whole blocks below the street, because the map tiles merge touching houses into
    //    polygons hundreds of metres across.)
    const bBase = new Int16Array(N).fill(-1), bTop = new Int16Array(N), bLow = new Int16Array(N);
    for (const b of feats.buildings) {
        const hv = Math.max(1, Math.round(b.h / V)), lv = Math.max(0, Math.round((b.minH || 0) / V));
        let any = false;
        fillPolygon(b.rings, n, (i, j) => {
            const c = j * n + i, base = g[c];
            any = true;
            if (bBase[c] < 0) { bBase[c] = base; bTop[c] = base + hv; bLow[c] = base + lv; }
            else { bTop[c] = Math.max(bTop[c], base + hv); bLow[c] = Math.min(bLow[c], base + lv); }
        });
        if (any) { stats.buildings++; if (b.estimated) stats.estimated++; }
    }

    // trees: keep a 1-cell clearing around buildings (10 m WorldCover pixels bleed onto roofs),
    // and leave some gaps so the canopy doesn't read as one solid slab
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const c = j * n + i;
        if (surf[c] !== TREE || bBase[c] >= 0) continue;
        const nearB = (i > 0 && bBase[c - 1] >= 0) || (i < n - 1 && bBase[c + 1] >= 0) ||
                      (j > 0 && bBase[c - n] >= 0) || (j < n - 1 && bBase[c + n] >= 0);
        if (nearB || hash2(i, j, 13) < 0.2) surf[c] = GRASS;
    }

    // bridge deck: level with the nearest banks (highest dry ground within ~60 m), at least one block above the water
    const deck = new Int16Array(N).fill(-1);
    const R = Math.max(2, Math.round(60 / V));
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const c = j * n + i; if (!bridge[c]) continue;
        let bank = -1;
        for (let dj = -R; dj <= R; dj += 1) for (let di = -R; di <= R; di += 1) {
            const x = i + di, y = j + dj;
            if (x < 0 || y < 0 || x >= n || y >= n) continue;
            const k = y * n + x;
            if (surf[k] !== WATER && bBase[k] < 0 && di * di + dj * dj <= R * R && g[k] > bank) bank = g[k];
        }
        deck[c] = Math.max(bank > 0 ? bank - 1 : g[c], g[c]);        // index of the deck voxel; water top is g[c]-1
        stats.bridgeCells = (stats.bridgeCells || 0) + 1;
    }

    // 4. column heights → grid
    const treeLo = Math.max(1, Math.round(cfg.TREE_MIN_M / V)), treeHi = Math.max(treeLo, Math.round(cfg.TREE_MAX_M / V));
    const colTop = new Int16Array(N); let ny = 1;
    for (let c = 0; c < N; c++) {
        let t;
        if (bBase[c] >= 0) t = bTop[c];
        else if (surf[c] === TREE) t = g[c] + treeLo + Math.floor(hash2(c % n, (c / n) | 0, 7) * (treeHi - treeLo + 1));
        else if (surf[c] === SHRUB) t = g[c] + 1;
        else t = g[c];
        if (deck[c] >= 0) t = Math.max(t, deck[c] + 1);
        colTop[c] = t; if (t > ny) ny = t;
    }
    const data = new Uint8Array(n * n * ny);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const c = j * n + i, o = (i * n + j) * ny;                  // file index: (x * nz + z) * ny + y
        if (bBase[c] >= 0) {
            stats.buildingCells++;
            for (let y = 0; y < bBase[c]; y++) data[o + y] = T.ground;
            for (let y = bLow[c]; y < bTop[c] - 1; y++) data[o + y] = T.building;
            data[o + bTop[c] - 1] = T.building_roof;
            continue;
        }
        const s = g[c];
        for (let y = 0; y < s; y++) data[o + y] = T.ground;
        switch (surf[c]) {
            case WATER: data[o + s - 1] = T.river; stats.waterCells++; if (deck[c] >= 0) data[o + deck[c]] = T.road; break;
            case ROAD: data[o + s - 1] = T.road; stats.roadCells++; break;
            case GRASS: data[o + s - 1] = T.tree_low; stats.grassCells++; break;
            case SHRUB: data[o + s] = T.tree_low; stats.grassCells++; break;
            case TREE:
                data[o + s - 1] = T.tree_low;
                for (let y = s; y < colTop[c]; y++) data[o + y] = T.tree_high;
                stats.treeCells++; break;
        }
    }
    return { grid: { nx: n, ny, nz: n, x0: 0, y0: 0, z0: 0, voxel: V, types: TYPES.slice(), data },
             stats, minElevation: Number.isFinite(minE) ? minE : 0, maxElevation: Number.isFinite(maxE) ? maxE : 0 };
}
