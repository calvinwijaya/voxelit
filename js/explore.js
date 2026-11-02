// "Find your city": world map, place search, and the square area picker.
import { CONFIG, viewUrl } from './config.js';
import { LOGO } from './isoart.js';

document.getElementById('logo').outerHTML = LOGO;
const $ = id => document.getElementById(id);
const MIN_PICK_ZOOM = 12;

const map = new maplibregl.Map({
    container: 'map',
    style: CONFIG.MAP_STYLE,
    center: [112, -3], zoom: 1.6,
    attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
map.on('style.load', () => { try { map.setProjection({ type: 'globe' }); } catch { /* older style spec */ } });

let sel = null;              // { lon, lat, name }
let size = CONFIG.DEFAULT_AREA;

// ---- size buttons
$('size-seg').innerHTML = CONFIG.AREA_SIZES.map(s =>
    `<button data-s="${s}" class="${s === size ? 'on' : ''}">${s >= 1000 ? s / 1000 + ' km' : s + ' m'}</button>`).join('');
$('size-seg').addEventListener('click', e => {
    const s = +e.target.dataset.s; if (!s) return;
    size = s;
    for (const b of $('size-seg').children) b.classList.toggle('on', +b.dataset.s === s);
    drawSelection();
});

// ---- selection square
function squareGeoJSON(lon, lat, side) {
    const h = side / 2 / 111320, w = side / 2 / (111320 * Math.cos(lat * Math.PI / 180));
    const ring = [[lon - w, lat - h], [lon + w, lat - h], [lon + w, lat + h], [lon - w, lat + h], [lon - w, lat - h]];
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] };
}
function ensureLayers() {
    if (map.getSource('sel')) return;
    map.addSource('sel', { type: 'geojson', data: squareGeoJSON(0, 0, 0) });
    map.addLayer({ id: 'sel-fill', type: 'fill', source: 'sel', paint: { 'fill-color': '#fbbf24', 'fill-opacity': 0.14 } });
    map.addLayer({ id: 'sel-line', type: 'line', source: 'sel', paint: { 'line-color': '#f59e0b', 'line-width': 2.5, 'line-dasharray': [2, 1.2] } });
}
function drawSelection() {
    if (!sel) return;
    ensureLayers();
    map.getSource('sel').setData(squareGeoJSON(sel.lon, sel.lat, size));
    $('select-panel').classList.remove('hidden');
    $('sel-name').textContent = sel.name || 'Selected area';
    $('sel-coords').textContent = `${sel.lat.toFixed(5)}, ${sel.lon.toFixed(5)}`;
    $('build-btn').href = viewUrl({ lat: sel.lat, lon: sel.lon, size, name: sel.name });
}
function select(lon, lat, name = null) {
    sel = { lon, lat, name };
    drawSelection();
    if (!name) reverseName(lon, lat).then(n => { if (sel && sel.lon === lon && n) { sel.name = n; drawSelection(); } });
}

map.on('click', e => {
    if (map.getZoom() < MIN_PICK_ZOOM) {
        map.flyTo({ center: e.lngLat, zoom: Math.min(MIN_PICK_ZOOM + 2, map.getZoom() + 4), speed: 1.6 });
        return;
    }
    select(e.lngLat.lng, e.lngLat.lat);
});
map.on('zoomend', () => {
    $('hint').textContent = map.getZoom() < MIN_PICK_ZOOM
        ? 'Zoom in and click anywhere to choose the area to voxelize.'
        : 'Click to place the square, then press “Build voxels”.';
});
map.on('load', () => { map.getCanvas().style.cursor = 'crosshair'; });

// ---- sample cities
// sample cities, then the places saved in this browser (★)
const saved = window.VXPlaces ? VXPlaces.list().slice(0, 8) : [];
const escHtml = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
$('chips').innerHTML = CONFIG.SAMPLE_CITIES.map(c => `<button class="chip" data-id="${c.id}">${c.name}</button>`).join('') +
    saved.map(p => `<button class="chip chip-saved" data-place="${p.id}" title="Saved place">★ ${escHtml(p.name)}</button>`).join('');
$('chips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    if (b.dataset.place) {
        const p = saved.find(p => p.id === b.dataset.place); if (!p) return;
        if (CONFIG.AREA_SIZES.includes(+p.size)) { size = +p.size; $('size-seg').querySelectorAll('button').forEach(x => x.classList.toggle('on', +x.dataset.s === size)); }
        return goTo(p.lon, p.lat, p.name);
    }
    const c = CONFIG.SAMPLE_CITIES.find(c => c.id === b.dataset.id); if (!c) return;
    goTo(c.lon, c.lat, `${c.name} · ${c.place}`);
});
function goTo(lon, lat, name, zoom = 15) {
    map.flyTo({ center: [lon, lat], zoom, speed: 1.8 });
    select(lon, lat, name);
}

// ---- search (Nominatim, OSM's free geocoder: max 1 request/second, so we debounce)
let timer = null, ctrl = null, items = [], active = -1;
$('search').addEventListener('input', e => {
    clearTimeout(timer);
    const q = e.target.value.trim();
    if (q.length < 3) { $('results').innerHTML = ''; return; }
    timer = setTimeout(() => search(q), 600);
});
$('search').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!items.length) return;
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; paint(); e.preventDefault();
    } else if (e.key === 'Enter') {
        if (items.length) pick(active >= 0 ? active : 0);
        else { clearTimeout(timer); search(e.target.value.trim()); }
    }
});
async function search(q) {
    if (!q) return;
    ctrl?.abort(); ctrl = new AbortController();
    try {
        const r = await fetch(`${CONFIG.GEOCODER}/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        items = await r.json(); active = -1; paint();
        if (!items.length) $('results').innerHTML = '<li class="dim">No places found</li>';
    } catch (err) { if (err.name !== 'AbortError') $('results').innerHTML = '<li class="dim">Search is unavailable right now</li>'; }
}
function paint() {
    $('results').innerHTML = items.map((it, k) => {
        const [first, ...rest] = it.display_name.split(', ');
        return `<li data-k="${k}" class="${k === active ? 'on' : ''}">${first}<small>${rest.slice(0, 3).join(', ')}</small></li>`;
    }).join('');
}
$('results').addEventListener('click', e => { const li = e.target.closest('li[data-k]'); if (li) pick(+li.dataset.k); });
function pick(k) {
    const it = items[k]; if (!it) return;
    const lon = +it.lon, lat = +it.lat, name = it.display_name.split(', ').slice(0, 2).join(', ');
    items = []; $('results').innerHTML = ''; $('search').value = name;
    // cities get a wider view; buildings/landmarks a closer one
    const zoom = ['city', 'administrative', 'state', 'county'].includes(it.type) ? 13 : 16;
    goTo(lon, lat, name, zoom);
}
async function reverseName(lon, lat) {
    try {
        const r = await fetch(`${CONFIG.GEOCODER}/reverse?format=jsonv2&zoom=16&lat=${lat}&lon=${lon}`);
        const j = await r.json();
        return j.display_name ? j.display_name.split(', ').slice(0, 2).join(', ') : null;
    } catch { return null; }
}

// open with ?lat&lon to preselect (e.g. "Back to map" from the viewer)
const qp = new URLSearchParams(location.search);
if (qp.has('lat') && qp.has('lon')) {
    if (qp.has('size') && CONFIG.AREA_SIZES.includes(+qp.get('size'))) { size = +qp.get('size'); $('size-seg').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.s === size)); }
    map.once('load', () => { map.jumpTo({ center: [+qp.get('lon'), +qp.get('lat')], zoom: 15 }); select(+qp.get('lon'), +qp.get('lat'), qp.get('name')); });
}
window.__voxelitMap = map;           // handy for debugging in the console
