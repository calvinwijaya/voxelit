// =====================================================================
//  SOLAR CORE — irradiance on every exposed voxel face (used by solar-worker.js, testable in Node)
//
//  For each sun position s (unit vector, scene axes: +x east, +y up, +z south) with clear-sky
//  direct-normal irradiance DNI and diffuse-horizontal DHI (W/m²) and a time weight w (hours):
//      E_face += w · ( DNI · max(0, n·s) · lit(face, s)  +  DHI · skyView(face) )
//  lit() casts a ray through the voxel grid (Amanatides & Woo traversal) toward the sun;
//  skyView() is the unblocked share of 12 sky directions above the face (×½ for walls, which see
//  half the sky). A voxel's value is its best-lit exposed face, so walls read their sunny side.
//  Lateral faces on the outer edge of the area are not real surfaces and are skipped.
// =====================================================================
(function (root) {
    const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]];     // no downward face: never sunlit
    // sky directions for the view factor: 4 azimuths × 3 elevations (15°, 40°, 65°)
    const SKY = [];
    for (const e of [15, 40, 65]) for (let a = 0; a < 360; a += 90) {
        const er = e * Math.PI / 180, ar = (a + e) * Math.PI / 180;
        SKY.push([Math.sin(ar) * Math.cos(er), Math.sin(er), -Math.cos(ar) * Math.cos(er)]);
    }

    /** true when the ray from (ox,oy,oz) along d leaves the grid without hitting a filled cell */
    function lit(data, nx, ny, nz, ox, oy, oz, dx, dy, dz) {
        let ix = Math.floor(ox), iy = Math.floor(oy), iz = Math.floor(oz);
        const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
        const tdx = dx ? Math.abs(1 / dx) : Infinity, tdy = dy ? Math.abs(1 / dy) : Infinity, tdz = dz ? Math.abs(1 / dz) : Infinity;
        let tx = dx ? (dx > 0 ? ix + 1 - ox : ox - ix) * tdx : Infinity;
        let ty = dy ? (dy > 0 ? iy + 1 - oy : oy - iy) * tdy : Infinity;
        let tz = dz ? (dz > 0 ? iz + 1 - oz : oz - iz) * tdz : Infinity;
        for (let guard = 0; guard < 4 * (nx + ny + nz); guard++) {
            if (iy >= ny || ix < 0 || iz < 0 || ix >= nx || iz >= nz) return true;   // left the area: open sky
            if (iy >= 0 && data[(ix * nz + iz) * ny + iy]) return false;
            if (tx < ty && tx < tz) { ix += sx; tx += tdx; }
            else if (ty < tz) { iy += sy; ty += tdy; }
            else { iz += sz; tz += tdz; }
        }
        return true;
    }

    /**
     * @param g     { data: Uint8Array (0 = empty), nx, ny, nz }
     * @param suns  [{ d: [x, y, z], dni, dhi, w }]
     * @param onProgress optional (fraction) callback
     * @returns { idx: Int32Array (cell index), val: Float32Array (Wh/m² summed with weights w), code: Uint8Array }
     */
    function solarCompute(g, suns, onProgress) {
        const { data, nx, ny, nz } = g, idx = [], val = [], code = [];
        const occ = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz && data[(x * nz + z) * ny + y] !== 0;
        const eps = 1e-3;
        for (let x = 0; x < nx; x++) {
            if (onProgress && x % 8 === 0) onProgress(x / nx);
            for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) {
                const c = (x * nz + z) * ny + y, t = data[c];
                if (!t) continue;
                let best = -1;
                for (const [fx, fy, fz] of FACES) {
                    const qx = x + fx, qy = y + fy, qz = z + fz;
                    if (fy === 0 && (qx < 0 || qz < 0 || qx >= nx || qz >= nz)) continue;      // skirt of the area
                    if (occ(qx, qy, qz)) continue;                                             // hidden face
                    // ray origin: centre of the face, nudged out of the voxel
                    const ox = x + 0.5 + fx * (0.5 + eps), oy = y + 0.5 + fy * (0.5 + eps), oz = z + 0.5 + fz * (0.5 + eps);
                    // sky view factor
                    let open = 0, seen = 0;
                    for (const s of SKY) {
                        const nd = s[0] * fx + s[1] * fy + s[2] * fz;
                        if (fy === 0 && nd <= 0) continue;
                        seen++;
                        if (lit(data, nx, ny, nz, ox, oy, oz, s[0], s[1], s[2])) open++;
                    }
                    const svf = (seen ? open / seen : 0) * (fy ? 1 : 0.5);
                    let e = 0;
                    for (const s of suns) {
                        const [dx, dy, dz] = s.d, cos = dx * fx + dy * fy + dz * fz;
                        let E = s.dhi * svf;
                        if (cos > 0 && lit(data, nx, ny, nz, ox, oy, oz, dx, dy, dz)) E += s.dni * cos;
                        e += E * s.w;
                    }
                    if (e > best) best = e;
                }
                if (best >= 0) { idx.push(c); val.push(best); code.push(t); }
            }
        }
        return { idx: Int32Array.from(idx), val: Float32Array.from(val), code: Uint8Array.from(code) };
    }

    /** clear-sky irradiance for a sun elevation (degrees): Meinel direct beam with Kasten–Young air mass */
    function clearSky(elDeg) {
        if (elDeg <= 0) return { dni: 0, dhi: 0 };
        const am = 1 / (Math.sin(elDeg * Math.PI / 180) + 0.50572 * Math.pow(elDeg + 6.07995, -1.6364));
        const dni = 1353 * Math.pow(0.7, Math.pow(am, 0.678));
        return { dni, dhi: 0.1 * dni * Math.sin(elDeg * Math.PI / 180) + 20 * Math.sin(elDeg * Math.PI / 180) };
    }

    root.solarCompute = solarCompute;
    root.solarClearSky = clearSky;
    root.solarLit = lit;
})(typeof self !== 'undefined' ? self : globalThis);
