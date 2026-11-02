// Voxelit generator worker: fetches open data for one square area and builds the voxels,
// off the main thread. Messages in:  {type:'generate', lon, lat, size, cfg}  |  {type:'load', bytes}
// Messages out: {type:'progress', pct, text} | {type:'result', ...} | {type:'error', message}
import { Frame, lonLatToTileF } from '../lib/geo.js';
import { decodeMVT } from '../lib/mvt.js';
import { voxelize, buildingHeight, toTerrain } from '../lib/voxelize.js';
import { encodeVXL, decodeVXL, gzip, maybeGunzip } from '../lib/vxl.js';

const progress = (pct, text) => postMessage({ type: 'progress', pct, text });
const fill = (tpl, o) => tpl.replace(/\{(\w+)\}/g, (_, k) => o[k]);

async function fetchOk(url, what) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${what}: HTTP ${res.status}`);
    return res;
}

// ---------- OpenStreetMap vector tiles (OpenFreeMap, OpenMapTiles schema) ----------
let tileTemplate = null;
async function vectorFeatures(frame, cfg, warnings) {
    if (!tileTemplate) {
        const tj = await (await fetchOk(cfg.VECTOR_TILEJSON, 'Vector TileJSON')).json();
        tileTemplate = tj.tiles[0];
    }
    const z = cfg.VECTOR_ZOOM, n = frame.n;
    const feats = { buildings: [], water: [], waterways: [], wood: [], grass: [], roads: [], network: [] };
    const WATERWAY_WIDTH = { river: 15, canal: 10, stream: 4 };
    const GRASS = new Set(['grass', 'farmland', 'wetland', 'park', 'pitch', 'cemetery', 'garden', 'meadow']);
    const tiles = frame.tiles(z);
    let done = 0;
    await Promise.all(tiles.map(async t => {
        let buf;
        try {
            buf = new Uint8Array(await (await fetchOk(fill(tileTemplate, t), 'Vector tile')).arrayBuffer());
        } catch (e) { warnings.push(`Map tile ${t.z}/${t.x}/${t.y} failed (${e.message})`); return; }
        buf = await maybeGunzip(buf);
        const layers = decodeMVT(buf);
        const conv = (geom, extent) => geom.map(r => r.map(([px, py]) => frame.fromTile(t.x + px / extent, t.y + py / extent, z)));
        const inside = rings => rings.some(r => r.some(([x, y]) => x > -n && y > -n && x < 2 * n && y < 2 * n));
        const each = (name, fn) => { const L = layers[name]; if (L) for (const f of L.features) fn(f, L.extent); };

        each('building', (f, ext) => {
            if (f.type !== 3 || f.props.hide_3d) return;
            const rings = conv(f.geom, ext); if (!inside(rings)) return;
            const { h, estimated } = buildingHeight(f.props, cfg);
            feats.buildings.push({ rings, h, minH: +f.props.render_min_height || 0, estimated });
        });
        each('water', (f, ext) => { if (f.type === 3) { const r = conv(f.geom, ext); if (inside(r)) feats.water.push(r); } });
        each('waterway', (f, ext) => {
            const w = WATERWAY_WIDTH[f.props.class];
            if (f.type !== 2 || !w || f.props.brunnel === 'tunnel') return;
            for (const line of conv(f.geom, ext)) feats.waterways.push({ line, width: w });
        });
        for (const lname of ['landcover', 'landuse', 'park']) each(lname, (f, ext) => {
            if (f.type !== 3) return;
            const cls = f.props.class, sub = f.props.subclass;
            const target = cls === 'wood' || sub === 'forest' || sub === 'wood' ? feats.wood
                         : GRASS.has(cls) || GRASS.has(sub) ? feats.grass : null;
            if (!target) return;
            const r = conv(f.geom, ext); if (inside(r)) target.push(r);
        });
        // roads: paved voxels + a network for the car simulation. Each tile's part is clipped to the tile
        // itself (tiles overlap by a buffer), so the network has no duplicated pieces.
        each('transportation', (f, ext) => {
            const w = ROAD_WIDTH[f.props.class];
            if (f.type !== 2 || !w || f.props.brunnel === 'tunnel') return;
            for (const part of f.geom) for (const piece of clipLine(part, ext)) {
                const line = piece.map(([px, py]) => frame.fromTile(t.x + px / ext, t.y + py / ext, z));
                if (!inside([line])) continue;
                feats.roads.push({ line, width: w, bridge: f.props.brunnel === 'bridge' });
                for (const seg of clipLine(line, n))                     // cars stay inside the area
                    feats.network.push({ c: f.props.class, o: +f.props.oneway || 0,
                        p: seg.flatMap(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]) });
            }
        });
        progress(5 + 35 * (++done / tiles.length), `Reading OpenStreetMap tiles (${done}/${tiles.length})`);
    }));
    if (!done) throw new Error('Could not download any OpenStreetMap tiles');
    return feats;
}

const ROAD_WIDTH = { motorway: 16, trunk: 14, primary: 12, secondary: 10, tertiary: 9, busway: 8, minor: 7, service: 4.5 };

/** clip a polyline to the square [0, size]² (Liang–Barsky per segment), returning the inside pieces */
function clipLine(pts, size) {
    const out = []; let cur = null;
    for (let k = 1; k < pts.length; k++) {
        let [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
        const dx = x1 - x0, dy = y1 - y0; let t0 = 0, t1 = 1, ok = true;
        for (const [p, q] of [[-dx, x0], [dx, size - x0], [-dy, y0], [dy, size - y0]]) {
            if (p === 0) { if (q < 0) { ok = false; break; } continue; }
            const r = q / p;
            if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; }
            else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
        }
        if (!ok) { cur = null; continue; }
        const a = [x0 + dx * t0, y0 + dy * t0], b = [x0 + dx * t1, y0 + dy * t1];
        if (!cur || t0 > 0) { cur = [a]; out.push(cur); }
        cur.push(b);
        if (t1 < 1) cur = null;
    }
    return out.filter(l => l.length > 1);
}

// ---------- Terrain (Terrarium PNG elevation tiles) ----------
async function elevation(frame, cfg, warnings) {
    const z = cfg.DEM_ZOOM, tiles = frame.tiles(z), img = new Map();
    await Promise.all(tiles.map(async t => {
        try {
            const blob = await (await fetchOk(fill(cfg.DEM_URL, t), 'Elevation tile')).blob();
            const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
            const cv = new OffscreenCanvas(bmp.width, bmp.height);
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(bmp, 0, 0);
            img.set(`${t.x}/${t.y}`, { w: bmp.width, d: ctx.getImageData(0, 0, bmp.width, bmp.height).data });
        } catch (e) { warnings.push(`Elevation tile failed (${e.message})`); }
    }));
    if (!img.size) { warnings.push('No terrain data — the ground is flat'); return null; }
    const size = img.values().next().value.w;
    const px = (gx, gy) => {                                         // elevation at a global pixel
        const tx = Math.floor(gx / size), ty = Math.floor(gy / size);
        const t = img.get(`${tx}/${ty}`); if (!t) return NaN;
        const k = ((gy - ty * size) * size + (gx - tx * size)) * 4, d = t.d;
        return d[k] * 256 + d[k + 1] + d[k + 2] / 256 - 32768;
    };
    const n = frame.n, out = new Float32Array(n * n);
    let last = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const [lon, lat] = frame.cellLonLat(i, j);
        const [tx, ty] = lonLatToTileF(lon, lat, z);
        const fx = tx * size - 0.5, fy = ty * size - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
        const a = px(x0, y0), b = px(x0 + 1, y0), c = px(x0, y0 + 1), d = px(x0 + 1, y0 + 1);
        let v = (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay;
        if (!Number.isFinite(v)) v = [a, b, c, d].find(Number.isFinite) ?? last;
        out[j * n + i] = last = v;
    }
    return toTerrain(out, n, frame.voxel, cfg);
}

// ---------- Trees & grass from satellite imagery ----------
// Vegetation index ExGR = ExG − ExR on chromatic coordinates (Meyer & Neto 2008): ExG = 2g−r−b, ExR = 1.4r−g,
// with r,g,b = R/(R+G+B)… Unlike plain 2G−R−B it ignores the greenish haze of grey roofs and asphalt that is common
// in tropical imagery. A cell is vegetated if most of its 3×3 samples are; isolated cells are dropped; dark or
// textured vegetation is tree canopy, bright smooth vegetation is grass. Thresholds: CONFIG.VEG.
async function vegetation(frame, cfg, warnings) {
    if (!cfg.VEG_IMAGERY_URL) return null;
    let z = 17; while (z > 13 && frame.tiles(z).length > cfg.VEG_MAX_TILES) z--;
    const tiles = frame.tiles(z), img = new Map();
    let failed = 0;
    await Promise.all(tiles.map(async t => {
        try {
            const blob = await (await fetchOk(fill(cfg.VEG_IMAGERY_URL, t), 'Imagery tile')).blob();
            const bmp = await createImageBitmap(blob);
            const cv = new OffscreenCanvas(bmp.width, bmp.height), ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(bmp, 0, 0);
            img.set(`${t.x}/${t.y}`, { w: bmp.width, d: ctx.getImageData(0, 0, bmp.width, bmp.height).data });
        } catch (e) { failed++; }
    }));
    if (!img.size) { warnings.push('Satellite imagery unavailable — trees from OpenStreetMap parks and woods only'); return null; }
    if (failed) warnings.push(`${failed} imagery tile(s) failed — some trees may be missing`);
    const size = img.values().next().value.w, n = frame.n, veg = new Uint8Array(n * n);
    const V = cfg.VEG;
    const px = (gx, gy) => {
        const tx = Math.floor(gx / size), ty = Math.floor(gy / size), t = img.get(`${tx}/${ty}`);
        if (!t) return null;
        const k = ((gy - ty * size) * size + (gx - tx * size)) * 4;
        return [t.d[k], t.d[k + 1], t.d[k + 2]];
    };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        let hit = 0, sum = 0, sum2 = 0, all = 0;
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
            const [lon, lat] = frame.cellLonLat(i - 0.5 + (a + 0.5) / 3, j - 0.5 + (b + 0.5) / 3);
            const [tx, ty] = lonLatToTileF(lon, lat, z);
            const p = px(Math.floor(tx * size), Math.floor(ty * size)); if (!p) continue;
            all++;
            const [R, G, B] = p, S = R + G + B + 1, r = R / S, g = G / S, bl = B / S;
            const exg = 2 * g - r - bl, exgr = exg - (1.4 * r - g), br = S / 3;
            if (exgr > V.exgr && exg > V.exg && G > V.minGreen && G > B * 1.05) { hit++; sum += br; sum2 += br * br; }
        }
        if (all && hit / all >= V.fraction) {
            const m = sum / hit, sd = Math.sqrt(Math.max(0, sum2 / hit - m * m));
            veg[j * n + i] = m < V.treeDark || (sd > V.treeTexture && m < V.treeBright) ? 2 : 1;
        }
    }
    // drop speckle: keep a vegetated cell only if at least 3 of its 8 neighbours are vegetated too
    const out = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const c = j * n + i; if (!veg[c]) continue;
        let nb = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const x = i + di, y = j + dj;
            if (x >= 0 && y >= 0 && x < n && y < n && veg[y * n + x]) nb++;
        }
        if (nb >= 3) out[c] = veg[c];
    }
    return out;
}

async function finish(grid, meta, stats, warnings, t0, gz) {
    progress(92, 'Compressing .vxl.gz');
    const raw = encodeVXL(grid, meta);                  // uncompressed, for the viewer
    if (!gz) gz = await gzip(raw);                     // compressed, for "Download"
    postMessage({ type: 'result', raw, bytes: gz, meta,
        grid: { nx: grid.nx, ny: grid.ny, nz: grid.nz, voxel: grid.voxel, types: grid.types },
        stats: { ...stats, voxels: countVoxels(grid), ms: Math.round(performance.now() - t0) },
        warnings }, [raw.buffer, gz.buffer]);
}
function countVoxels(grid) { let c = 0; for (const v of grid.data) if (v) c++; return c; }

onmessage = async ({ data: msg }) => {
    const t0 = performance.now(), warnings = [];
    try {
        if (msg.type === 'generate') {
            const { lon, lat, size, cfg } = msg;
            const frame = new Frame(lon, lat, Math.min(size, cfg.MAX_AREA), cfg.VOXEL_SIZE);
            progress(2, 'Downloading OpenStreetMap, terrain and imagery');
            const [feats, elev, cover] = await Promise.all([
                vectorFeatures(frame, cfg, warnings),
                elevation(frame, cfg, warnings),
                vegetation(frame, cfg, warnings),
            ]);
            progress(70, `Voxelizing ${feats.buildings.length} buildings`);
            const { grid, stats, minElevation, maxElevation } =
                voxelize({ n: frame.n, V: cfg.VOXEL_SIZE, feats, elev, cover, cfg });
            stats.sources = { osm: true, terrain: !!elev, imagery: !!cover };
            const meta = { generator: 'Voxelit!', created: new Date().toISOString(), lon, lat,
                size: frame.size, voxel: cfg.VOXEL_SIZE, axes: 'x=east, y=up, z=south; grid centred on lon/lat',
                groundElevation: elev ? minElevation : null, maxElevation: elev ? maxElevation : null,
                sources: ['© OpenStreetMap contributors (ODbL) via OpenFreeMap', elev && 'Terrain: Mapzen Terrarium / AWS Open Data',
                          cover && 'Trees & grass classified from Esri World Imagery'].filter(Boolean),
                roads: feats.network };                                  // road network for the car simulation
            await finish(grid, meta, stats, warnings, t0);
        } else if (msg.type === 'load') {
            progress(20, 'Reading file');
            const raw = new Uint8Array(msg.bytes);
            const grid = decodeVXL(await maybeGunzip(raw));
            await finish(grid, grid.meta, {}, warnings, t0, raw);
        }
    } catch (err) {
        postMessage({ type: 'error', message: err.message || String(err) });
    }
};
