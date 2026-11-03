// =====================================================================
//  SOLAR ANALYSIS — heatmap of sunlight on every voxel (toggle under "Time & Sun", off by default)
//   • "Now":       irradiance at the selected time (W/m²)
//   • "Whole day": energy over the selected date, sun every 30 min (kWh/m² per day)
//  Clear-sky model, shading by the voxel city itself (see solar-core.js). Runs in a Web Worker.
// =====================================================================
(function () {
    const $ = id => document.getElementById(id);
    const S = APP.sky, rad = Math.PI / 180;
    // colour ramp (inferno-like, without the near-black end so shade is still readable at night)
    const RAMP = ['#2d1b54', '#4a1a6e', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4'].map(h => new THREE.Color(h));
    const NONE = new THREE.Color('#3f3f46');
    const ramp = (t, out) => {
        t = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
        const k = Math.min(RAMP.length - 2, Math.floor(t));
        return out.copy(RAMP[k]).lerp(RAMP[k + 1], t - k);
    };

    let on = false, mode = 'day', worker = null, busy = false, pending = false, jobId = 0, lastKey = '', result = null, scale = 1;
    const light = new THREE.HemisphereLight(0xffffff, 0x9ca3af, 0);
    APP.scene.add(light);

    // ---------- sun positions for the current setting ----------
    function sunVector(date) {
        const p = S.solar(date, CONFIG.GEOREF.lat, CONFIG.GEOREF.lon), e = p.el * rad, a = p.az * rad;
        return { el: p.el, d: [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)] };
    }
    function localDay() {
        const tz = CONFIG.TIMEZONE_OFFSET_H * 3600e3, l = new Date(S.date.getTime() + tz);
        return { start: Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) - tz, label: l.toISOString().slice(0, 10) };
    }
    function suns() {
        if (mode === 'now') {
            const s = sunVector(S.date);
            return s.el > 0 ? [{ d: s.d, ...solarClearSky(s.el), w: 1 }] : [];
        }
        const out = [], { start } = localDay();
        for (let m = 15; m < 1440; m += 30) {                              // middle of each half hour
            const s = sunVector(new Date(start + m * 60000));
            if (s.el > 0.5) out.push({ d: s.d, ...solarClearSky(s.el), w: 0.5 });
        }
        return out;
    }
    const keyNow = () => mode === 'now' ? `now ${Math.round(S.date.getTime() / 300000)}` : `day ${localDay().label}`;

    // ---------- run ----------
    function run() {
        if (!on || !APP.grid) return;
        if (busy) { pending = true; return; }
        lastKey = keyNow();
        const g = APP.grid, L = APP.layers, data = new Uint8Array(g.data);
        for (let i = 0; i < data.length; i++) if (data[i] && L.isRemoved(i)) data[i] = 0;   // burnt voxels are gone
        const list = suns();
        if (!list.length) { show(null, 'The sun is below the horizon at this time — try “Whole day” or a daytime hour'); return; }
        if (!worker) {
            worker = new Worker('js/sim/solar-worker.js');
            worker.onmessage = ({ data: m }) => {
                if (m.id !== jobId) return;
                if (m.type === 'progress') { status(`Tracing sunlight… ${Math.round(m.f * 100)}%`); return; }
                busy = false;
                if (m.type === 'error') status('Solar analysis failed: ' + m.message, 'warn');
                else show(m);
                if (pending) { pending = false; run(); }
            };
        }
        busy = true; jobId++;
        status(mode === 'now' ? 'Tracing sunlight…' : `Tracing ${list.length} sun positions over the day…`);
        worker.postMessage({ id: jobId, data, nx: g.nx, ny: g.ny, nz: g.nz, suns: list }, [data.buffer]);
    }

    // ---------- show ----------
    function status(t, cls) { const s = $('solar-status'); s.textContent = t; s.className = 'status ' + (cls || ''); }
    function show(r, msg) {
        result = r;
        if (!r) { paint(); status(msg, ''); $('solar-stats').innerHTML = ''; legend(0); return; }
        // colour scale: 0 … 98th percentile, so a few very bright walls don't wash out the rest
        const v = Array.from(r.val).sort((a, b) => a - b);
        const unit = mode === 'now' ? 1 : 1000;                             // W/m² or kWh/m²
        scale = Math.max(v[Math.floor(v.length * 0.98)] || 1, mode === 'now' ? 50 : 200);
        paint();
        legend(scale / unit);
        // statistics by surface type
        const g = APP.grid, sum = {}, cnt = {};
        for (let k = 0; k < r.idx.length; k++) { const t = g.typeName(r.code[k]); sum[t] = (sum[t] || 0) + r.val[k]; cnt[t] = (cnt[t] || 0) + 1; }
        const avg = t => cnt[t] ? fmt(sum[t] / cnt[t] / unit) : '–';
        const roofs = [], shade = { n: 0, dark: 0 };
        for (let k = 0; k < r.idx.length; k++) {
            const t = g.typeName(r.code[k]);
            if (t === 'building_roof') roofs.push(r.val[k]);
            if (t === 'ground' || t === 'road' || t === 'tree_low') { shade.n++; if (r.val[k] < 0.3 * scale) shade.dark++; }
        }
        roofs.sort((a, b) => b - a);
        const u = mode === 'now' ? 'W/m²' : 'kWh/m²';
        const rows = [
            ['Roofs, average', `${avg('building_roof')} ${u}`],
            ['Best 10 % of roofs', roofs.length ? `${fmt(roofs[Math.floor(roofs.length * 0.1)] / unit)} ${u} or more` : '–'],
            ['Streets & ground, average', `${cnt.ground || cnt.road ? fmt(((sum.ground || 0) + (sum.road || 0)) / ((cnt.ground || 0) + (cnt.road || 0)) / unit) : '–'} ${u}`],
            ['Ground in deep shade', shade.n ? `${Math.round(100 * shade.dark / shade.n)} %` : '–'],
        ];
        $('solar-stats').innerHTML = rows.map(([k, x]) => `<span>${k}</span><b>${x}</b>`).join('');
        const when = mode === 'now' ? `${S.fmtTime(S.date)} ${CONFIG.TZ_LABEL}, ${localDay().label}` : `the whole of ${localDay().label}`;
        status(`Clear-sky sunlight for ${when}`, 'ok');
    }
    function fmt(x) { return x >= 100 ? Math.round(x).toString() : x.toFixed(x >= 10 ? 1 : 2); }
    function legend(max) {
        $('solar-max').textContent = max ? `${fmt(max)}${mode === 'now' ? ' W/m²' : ' kWh/m²/day'}` : '';
        $('solar-mid').textContent = max ? fmt(max / 2) : '';
    }

    const _c = new THREE.Color(), WHITE = new THREE.Color(1, 1, 1);
    /** colour every drawn voxel from the result (or back to normal when off) */
    function paint() {
        const L = APP.layers, g = APP.grid; if (!L) return;
        const value = new Map();
        if (on && result) for (let k = 0; k < result.idx.length; k++) value.set(result.idx[k], result.val[k]);
        for (const [name, mesh] of Object.entries(L.meshes)) {
            const code = g.code[name], cells = L.cellOf[code];
            APP.materials[name].color.set(on ? '#ffffff' : CONFIG.COLORS[name]);
            for (let k = 0; k < mesh.count; k++) {
                const i = cells[k];
                let col;
                if (on) { const v = value.get(i); col = v === undefined ? NONE : ramp(v / scale, _c); }
                else col = (APP.fire && APP.fire.tintOf && APP.fire.tintOf(i)) || WHITE;
                mesh.setColorAt(k, col);
            }
            mesh.instanceColor.needsUpdate = true;
        }
        if (!on) document.dispatchEvent(new CustomEvent('layers-built'));   // let the basemap re-apply ground imagery colours
    }

    // ---------- UI ----------
    function setOn(v) {
        on = v;
        $('solar-on').checked = v;
        $('solar-panel').classList.toggle('hidden', !v);
        document.body.classList.toggle('solar', v);
        if (v) run(); else { result = null; paint(); }
    }
    $('solar-on').onchange = e => setOn(e.target.checked);
    $('solar-mode').onclick = e => {
        const m = e.target.dataset.m; if (!m || m === mode) return;
        mode = m;
        $('solar-mode').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.m === mode));
        run();
    };
    $('solar-refresh').onclick = () => run();

    // follow the clock / date: "now" every 5 simulated minutes, "whole day" when the date changes
    let wait = 0;
    APP.updaters.push(dt => {
        light.intensity = on ? 0.25 + 0.65 * (S.night || 0) : 0;        // keep the heatmap readable at night
        if (!on) return;
        wait -= dt;
        if (wait <= 0 && keyNow() !== lastKey) { wait = 0.35; run(); }
    });
    document.addEventListener('voxels-ready', () => { $('solar-on').checked = false; });
    APP.solar = { setOn, run, get result() { return result; }, get scale() { return scale; }, get mode() { return mode; } };
})();
