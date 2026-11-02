// =====================================================================
//  CARS — a simple traffic simulation on the OpenStreetMap road network (no API, no key)
//  Roads come from the generator (window.VOXELIT_ROADS, stored in the .vxl.gz footer).
//  Cars follow the network: at every junction they pick a random onward road (respecting one-ways),
//  keep to the correct side for left/right-hand traffic, and switch on headlights at night.
//  This is an illustration of movement, not a traffic model: no congestion, signals or collisions.
// =====================================================================
(function () {
    const C = CONFIG.CARS, $ = id => document.getElementById(id);
    const SPEED = { motorway: 24, trunk: 19, primary: 14, secondary: 12, tertiary: 11, busway: 10, minor: 8, service: 5 };
    const PER_KM = { motorway: 40, trunk: 32, primary: 26, secondary: 20, tertiary: 14, busway: 6, minor: 6, service: 2 };
    const LANE = { motorway: 4.5, trunk: 4, primary: 3.4, secondary: 3, tertiary: 2.6, busway: 2.4, minor: 1.9, service: 1.2 };
    const PAINT = ['#f8fafc', '#e5e7eb', '#9ca3af', '#374151', '#111827', '#dc2626', '#2563eb', '#0f766e', '#f59e0b', '#7c3aed'];

    let edges = [], nodes = new Map(), cars = [], body = null, lights = null, show = true, density = 1, kmTotal = 0;
    let skip;

    function groundY(x, z) {
        const g = APP.grid, lx = Math.max(0, Math.min(g.nx - 1, g.cellX(x))), lz = Math.max(0, Math.min(g.nz - 1, g.cellZ(z)));
        const ly = g.topWhere(lx, lz, c => !skip[c]);
        return ly < 0 ? APP.minGroundTop : g.worldY(ly) + g.VS / 2;
    }

    // ---------- network ----------
    function build() {
        const g = APP.grid, VS = g.VS, roads = window.VOXELIT_ROADS || [];
        skip = new Uint8Array(g.types.length + 1);
        ['building', 'building_roof', 'tree_high'].forEach(t => { if (g.code[t]) skip[g.code[t]] = 1; });
        edges = []; nodes = new Map(); kmTotal = 0;
        const key = (x, z) => `${Math.round(x / 2.5)},${Math.round(z / 2.5)}`;     // junctions snap within ~2.5 m
        const node = (x, z) => { const k = key(x, z); if (!nodes.has(k)) nodes.set(k, { out: [] }); return nodes.get(k); };
        // grid units (cell index + fraction) → scene metres; cell i is centred on worldX(i)
        const lines = roads.filter(r => SPEED[r.c]).map(r => {
            const pts = [];
            for (let k = 0; k < r.p.length; k += 2) pts.push([(r.p[k] - 0.5 + g.x0) * VS, (r.p[k + 1] - 0.5 + g.z0) * VS]);
            return { r, pts };
        });
        // OSM ways often run straight through junctions: split them wherever another road shares a vertex
        const uses = new Map();
        lines.forEach(({ pts }, li) => pts.forEach(([x, z]) => { const k = key(x, z); if (!uses.has(k)) uses.set(k, new Set()); uses.get(k).add(li); }));
        const pieces = [];
        for (const { r, pts } of lines) {
            let start = 0;
            for (let k = 1; k < pts.length - 1; k++) if (uses.get(key(pts[k][0], pts[k][1])).size > 1) { pieces.push({ r, pts: pts.slice(start, k + 1) }); start = k; }
            pieces.push({ r, pts: pts.slice(start) });
        }
        for (const { r, pts } of pieces) {
            // resample every 3 m and drape on the voxel ground, smoothing out the 5 m terrain steps
            const s = [];
            for (let k = 1; k < pts.length; k++) {
                const [ax, az] = pts[k - 1], [bx, bz] = pts[k], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 3));
                for (let q = k === 1 ? 0 : 1; q <= n; q++) s.push([ax + (bx - ax) * q / n, az + (bz - az) * q / n]);
            }
            if (s.length < 2) continue;
            let ys = s.map(([x, z]) => groundY(x, z));
            for (let it = 0; it < 4; it++) ys = ys.map((y, k) => (ys[Math.max(0, k - 2)] + ys[Math.max(0, k - 1)] + y + ys[Math.min(ys.length - 1, k + 1)] + ys[Math.min(ys.length - 1, k + 2)]) / 5);
            const p = s.map(([x, z], k) => [x, ys[k], z]);
            const cum = [0];
            for (let k = 1; k < p.length; k++) cum.push(cum[k - 1] + Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1], p[k][2] - p[k - 1][2]));
            const e = { p, cum, len: cum[cum.length - 1], cls: r.c, one: r.o };
            if (e.len < 1) continue;
            e.a = node(p[0][0], p[0][2]); e.b = node(p[p.length - 1][0], p[p.length - 1][2]);
            if (e.one >= 0) e.a.out.push({ e, dir: 1 });                 // drivable start → end
            if (e.one <= 0) e.b.out.push({ e, dir: -1 });                // drivable end → start
            edges.push(e); kmTotal += e.len / 1000;
        }
        spawnCars();
    }

    function spawnCars() {
        cars = [];
        const budget = Math.round(C.maxCars * (APP.isTouch ? 0.5 : 1) * density);
        const want = edges.map(e => e.len / 1000 * PER_KM[e.cls]);
        const total = want.reduce((a, v) => a + v, 0), k = Math.min(1, budget / Math.max(1, total));
        edges.forEach((e, i) => {
            let n = want[i] * k; n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
            for (let q = 0; q < n; q++) {
                const dir = e.one > 0 ? 1 : e.one < 0 ? -1 : (Math.random() < 0.5 ? 1 : -1);
                cars.push({ e, dir, d: Math.random() * e.len, v: SPEED[e.cls] * (0.75 + 0.4 * Math.random()), seg: 0 });
            }
        });
        makeMeshes();
        $('cars-status').textContent = edges.length
            ? `${cars.length} cars on ${kmTotal.toFixed(1)} km of road · ${CONFIG.CARS.leftHand ? 'left' : 'right'}-hand traffic`
            : 'No road network in this file (areas built with Voxelit! have one)';
    }

    function makeMeshes() {
        [body, lights].forEach(m => { if (m) { APP.scene.remove(m); m.geometry.dispose(); m.material.dispose(); } });
        body = lights = null;
        if (!cars.length) return;
        const g1 = new THREE.BoxGeometry(1.9, 1.45, 4.4); g1.translate(0, 0.72, 0);
        const cabin = new THREE.BoxGeometry(1.7, 0.7, 2.2); cabin.translate(0, 1.75, 0.3);
        body = new THREE.InstancedMesh(mergeBoxes([g1, cabin]), new THREE.MeshLambertMaterial(), cars.length);
        const tint = new THREE.Color();
        cars.forEach((c, i) => body.setColorAt(i, tint.set(PAINT[(Math.random() * PAINT.length) | 0])));
        body.instanceColor.needsUpdate = true;
        body.castShadow = false; body.receiveShadow = true; body.frustumCulled = false; body.visible = show;
        // headlights: two small bright blocks at the front, visible at night
        const hl = new THREE.BoxGeometry(1.5, 0.28, 0.12); hl.translate(0, 0.85, -2.22);
        lights = new THREE.InstancedMesh(hl, new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0, fog: false }), cars.length);
        lights.frustumCulled = false; lights.visible = show;
        APP.scene.add(body, lights);
    }
    // r128 has no BufferGeometryUtils on the global build: merge two non-indexed boxes by hand
    function mergeBoxes(list) {
        const parts = list.map(b => b.toNonIndexed());
        const n = parts.reduce((a, p) => a + p.attributes.position.count, 0);
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
        for (const p of parts) { pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); o += p.attributes.position.count; }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        return g;
    }

    // ---------- driving ----------
    function nextEdge(c) {
        const end = c.dir > 0 ? c.e.b : c.e.a;
        let opts = end.out.filter(o => o.e !== c.e);
        if (!opts.length) opts = end.out;                                 // dead end: turn around
        if (!opts.length) { c.dir = -c.dir; c.d = 0; return; }           // one-way into nowhere
        const pick = opts[(Math.random() * opts.length) | 0];
        c.e = pick.e; c.dir = pick.dir; c.d = 0; c.seg = 0;
        c.v = SPEED[c.e.cls] * (0.75 + 0.4 * Math.random());
    }
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
    function update(dt) {
        if (!body || !show) return;
        const side = CONFIG.CARS.leftHand ? -1 : 1;
        for (let i = 0; i < cars.length; i++) {
            const c = cars[i];
            c.d += c.v * dt;
            let guard = 0;
            while (c.d >= c.e.len && guard++ < 4) { const over = c.d - c.e.len; nextEdge(c); c.d = over; }
            const e = c.e, along = c.dir > 0 ? c.d : e.len - c.d;
            // segment lookup (cars move forward a little each frame, so start from the last one)
            let k = Math.min(c.seg, e.cum.length - 2);
            if (e.cum[k] > along) k = 0;
            while (k < e.cum.length - 2 && e.cum[k + 1] < along) k++;
            c.seg = k;
            const a = e.p[k], b = e.p[k + 1], f = (along - e.cum[k]) / Math.max(1e-6, e.cum[k + 1] - e.cum[k]);
            let dx = (b[0] - a[0]) * c.dir, dz = (b[2] - a[2]) * c.dir; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
            const off = e.one ? 0 : LANE[e.cls] * side;                // two-way roads: keep to one side
            P.set(a[0] + (b[0] - a[0]) * f - dz * off, a[1] + (b[1] - a[1]) * f + 0.05, a[2] + (b[2] - a[2]) * f + dx * off);
            Q.setFromAxisAngle(UP, Math.atan2(-dx, -dz));                // model faces -Z
            M.compose(P, Q, ONE);
            body.setMatrixAt(i, M); lights.setMatrixAt(i, M);
        }
        body.instanceMatrix.needsUpdate = true; lights.instanceMatrix.needsUpdate = true;
        lights.material.opacity = APP.sky ? Math.min(1, APP.sky.night * 1.4) : 0;
    }

    // ---------- UI ----------
    $('cars-show').onchange = e => { show = e.target.checked; if (body) body.visible = lights.visible = show; };
    $('cars-density').oninput = e => { density = +e.target.value / 100; $('cars-density-label').textContent = `${e.target.value}%`; };
    $('cars-density').onchange = () => { if (APP.grid) spawnCars(); };
    $('cars-density-label').textContent = `${$('cars-density').value}%`;
    density = +$('cars-density').value / 100;
    document.addEventListener('voxels-ready', () => { build(); APP.updaters.push(update); });
    document.addEventListener('drive-side', () => { if (edges.length) $('cars-status').textContent = `${cars.length} cars on ${kmTotal.toFixed(1)} km of road · ${CONFIG.CARS.leftHand ? 'left' : 'right'}-hand traffic`; });
    APP.cars = { get count() { return cars.length; }, get edges() { return edges.length; }, get km() { return kmTotal; } };
})();
