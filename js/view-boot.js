// Voxelit viewer boot: generates (or opens) the voxel area, configures the simulation for that place,
// then loads the simulation scripts (js/sim/*, from Voxel-FT-UGM) in order.
import { CONFIG as VX } from './config.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const SIM = ['voxel-grid', 'main', 'geo', 'weather', 'sky', 'wind', 'rain', 'fire', 'cats', 'cat-maker', 'player', 'basemap', 'cars', 'tools', 'touch', 'minimap'];
// used when an opened file carries no location (original Voxel FT UGM files)
const FT_UGM = { lat: -7.7652, lon: 110.3725, name: 'Faculty of Engineering, Universitas Gadjah Mada' };

let result = null, placeName = null;

// ---------------- progress ----------------
function progress(pct, text) {
    $('loading').classList.remove('hidden');
    if (text) $('loading-text').textContent = text;
    const bar = $('loading-bar'); if (bar) bar.style.width = `${Math.round(pct)}%`;
}
function fail(msg) {
    $('loading').innerHTML = `Something went wrong<br><small>${msg}</small><br><br><a href="explore.html">Back to the map</a>`;
}
function setPlace(name, lat, lon) {
    placeName = name;
    window.VOXELIT_PLACE = { ...(window.VOXELIT_PLACE || {}), name, lat, lon };
    document.dispatchEvent(new CustomEvent('place-changed'));
    $('place-name').textContent = name || 'Unnamed area';
    document.title = `${name || 'Area'} — Voxelit!`;
    $('place-coords').textContent = lat != null ? `${(+lat).toFixed(5)}, ${(+lon).toFixed(5)}` : '';
    if (lat != null) $('back-map').href = `explore.html?lat=${lat}&lon=${lon}&size=${params.get('size') || VX.DEFAULT_AREA}`;
}
// countries that drive on the left (ISO 3166-1 alpha-2)
const LEFT_HAND = new Set(('gb ie im je gg mt cy in pk bd lk np bt mv id my sg bn th tl jp hk mo au nz pg fj sb ws to ki tv nr ' +
    'za na bw zw zm mw mz tz ke ug ls sz mu sc jm bs bb tt gy sr ag dm gd kn lc vc vg ky bm tc ms ai fk sh ck nu').split(' '));
let leftHand = null;
function setDriveSide(cc) {
    if (!cc) return;
    leftHand = LEFT_HAND.has(cc.toLowerCase());
    if (window.CONFIG && CONFIG.CARS) { CONFIG.CARS.leftHand = leftHand; document.dispatchEvent(new CustomEvent('drive-side')); }
}
/** place name + country code from OpenStreetMap's Nominatim */
async function lookup(lat, lon) {
    try {
        const r = await fetch(`${VX.GEOCODER}/reverse?format=jsonv2&zoom=16&lat=${lat}&lon=${lon}`);
        const j = await r.json();
        setDriveSide(j.address && j.address.country_code);
        return j.display_name ? j.display_name.split(', ').slice(0, 2).join(', ') : null;
    } catch { return null; }
}

// ---------------- generator worker ----------------
const worker = new Worker(new URL('./worker/generate.worker.js', import.meta.url), { type: 'module' });
const run = msg => new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
        if (data.type === 'progress') progress(data.pct * 0.85, data.text);
        else if (data.type === 'error') reject(new Error(data.message));
        else if (data.type === 'result') resolve(data);
    };
    worker.onerror = e => reject(new Error(e.message || 'The generator could not start (needs a recent browser).'));
    worker.postMessage(msg.payload, msg.transfer || []);
});

// ---------------- load classic scripts in order ----------------
const loadScript = src => new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = false;
    s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
    document.body.appendChild(s);
});

async function startSimulation(res, lat, lon, fromFile) {
    result = res;
    progress(88, 'Starting the simulation');
    await loadScript('js/sim/config.js');
    const C = window.CONFIG;
    C.VOXEL_SIZE = res.grid.voxel;
    Object.assign(C.GEOREF, { lat, lon });
    C.PLAYER.spawn = { lat, lon, headingDeg: null };
    C.PLAYER.jumpHeight = Math.max(2.8, C.VOXEL_SIZE + 0.7);        // big voxels: one jump clears one block
    C.TIMEZONE_OFFSET_H = Math.round(lon / 15);                     // first guess; Open-Meteo sends the real one
    C.TZ_LABEL = `UTC${C.TIMEZONE_OFFSET_H >= 0 ? '+' : ''}${C.TIMEZONE_OFFSET_H}`;
    if (C.VOXEL_SIZE >= 4) C.WIND.particles = 3500;
    // scene Y → metres above sea level (ground layer 1 of the generator sits at the lowest terrain height)
    if (res.meta?.groundElevation != null) C.ELEV_OFFSET = res.meta.groundElevation - C.VOXEL_SIZE / 2;                 // bigger areas, a few more streamlines
    C.CARS.leftHand = !!leftHand;                                     // updated again if the country arrives later
    window.VOXELIT_ROADS = res.meta?.roads || [];
    window.VOXELIT_BUFFER = res.raw.buffer;
    let scriptsLoaded; window.VOXELIT_SCRIPTS_LOADED = new Promise(r => (scriptsLoaded = r));
    // download all in parallel; async=false keeps them executing in this order
    await Promise.all(SIM.map(name => loadScript(`js/sim/${name}.js`)));
    scriptsLoaded();
    showArea(res, fromFile);
}

// ---------------- "This area" panel ----------------
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(2) + ' M' : n >= 1e4 ? (n / 1e3).toFixed(1) + ' k' : String(n);
function showArea({ grid, stats, meta, warnings, bytes }, fromFile) {
    const rows = [
        ['Grid', `${grid.nx} × ${grid.nz} × ${grid.ny}`], ['Voxel size', `${grid.voxel} m`],
        ['Area', `${(grid.nx * grid.voxel / 1000).toFixed(2)} × ${(grid.nz * grid.voxel / 1000).toFixed(2)} km`],
        ['Voxels', fmt(stats.voxels)],
    ];
    if (stats.buildings != null) rows.push(['Footprints', `${fmt(stats.buildings)}${stats.buildings ? ` (${Math.round(100 * stats.estimated / stats.buildings)}% est. height)` : ''}`]);
    if (stats.treeCells != null) rows.push(['Tree cover', `${(100 * stats.treeCells / (grid.nx * grid.nz)).toFixed(1)}%`]);
    if (meta?.groundElevation != null) rows.push(['Terrain', `${Math.round(meta.groundElevation)}–${Math.round(meta.maxElevation)} m`]);
    rows.push(['File size', `${Math.max(1, Math.round(bytes.length / 1024))} KB`]);
    if (!fromFile) rows.push(['Built in', `${(stats.ms / 1000).toFixed(1)} s`]);
    $('area-stats').innerHTML = rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
    const w = warnings || [];
    $('area-warnings').classList.toggle('hidden', !w.length);
    $('area-warnings').innerHTML = w.slice(0, 4).map(x => `<div>⚠ ${x}</div>`).join('');
    $('area-sources').textContent = (meta?.sources || ['Voxel file opened from this device']).join(' · ');
    $('share-btn').style.display = params.has('lat') ? '' : 'none';
    if (w.length) $('sec-area').open = true;
}
$('download-btn').onclick = () => {
    if (!result) return;
    const slug = (placeName || 'area').toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'area';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([result.bytes], { type: 'application/gzip' }));
    a.download = `voxelit_${slug}_${result.grid.voxel}m.vxl.gz`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$('share-btn').onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); $('share-btn').textContent = 'Link copied'; }
    catch { prompt('Copy this link:', location.href); }
    setTimeout(() => ($('share-btn').textContent = 'Copy link'), 1800);
};
// the simulation scripts can only start once per page, so another file opens in a fresh page
$('open-btn').onclick = () => { location.href = 'view.html?upload=1'; };

// ---------------- open a file ----------------
async function openFile(file) {
    if (!file) return;
    $('dropzone').classList.add('hidden');
    progress(5, `Opening ${file.name}`);
    try {
        const buf = await file.arrayBuffer();
        const res = await run({ payload: { type: 'load', bytes: buf }, transfer: [buf] });
        const m = res.meta;
        const loc = m && Number.isFinite(m.lat) ? { lat: m.lat, lon: m.lon, name: null } : FT_UGM;
        if (!m || !Number.isFinite(m.lat)) res.warnings.push('This file has no location; assuming FT UGM, Yogyakarta (weather, sun and basemap use it)');
        window.VOXELIT_PLACE = { size: m && m.size, fromFile: true };                 // a file can't be re-opened from a link
        setPlace(loc.name || file.name.replace(/\.vxl(\.gz)?$/i, ''), loc.lat, loc.lon);
        if (loc === FT_UGM) setDriveSide('id');
        lookup(loc.lat, loc.lon).then(n => { if (!loc.name && n) setPlace(n, loc.lat, loc.lon); });
        await startSimulation(res, loc.lat, loc.lon, true);
    } catch (e) { fail(e.message); }
}
$('file-input').onchange = e => openFile(e.target.files[0]);
addEventListener('dragover', e => { e.preventDefault(); $('dropzone').classList.add('drag'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) $('dropzone').classList.remove('drag'); });
addEventListener('drop', e => {
    e.preventDefault(); $('dropzone').classList.remove('drag');
    if (!result) openFile(e.dataTransfer.files[0]);
});

// ---------------- start ----------------
const lat = parseFloat(params.get('lat')), lon = parseFloat(params.get('lon'));
if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 85) {
    const size = Math.min(VX.MAX_AREA, Math.max(200, parseInt(params.get('size')) || VX.DEFAULT_AREA));
    const given = params.get('name');
    window.VOXELIT_PLACE = { size, fromFile: false };
    setPlace(given || 'Finding the place name…', lat, lon);
    lookup(lat, lon).then(n => { if (!given) setPlace(n || `${lat.toFixed(4)}, ${lon.toFixed(4)}`, lat, lon); });
    progress(1, 'Downloading map data');
    run({ payload: { type: 'generate', lat, lon, size, cfg: VX } })
        .then(res => startSimulation(res, lat, lon, false))
        .catch(e => fail(e.message));
} else {
    setPlace('Open a file');
    $('loading').classList.add('hidden');
    $('dropzone').classList.remove('hidden');
}
