// Rasterising polygons and lines onto the n×n grid. Coordinates are fractional grid units.

/**
 * Even-odd scanline fill: every cell whose centre is inside the polygon (holes and multipolygons
 * handled by the even-odd rule). Calls fn(i, j) per cell; returns the number of cells filled.
 * A polygon smaller than one cell still gets the cell under its centroid, so small houses survive.
 */
export function fillPolygon(rings, n, fn) {
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (const r of rings) for (const [x, y] of r) {
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
    }
    if (maxX < 0 || maxY < 0 || minX >= n || minY >= n) return 0;
    const j0 = Math.max(0, Math.ceil(minY - 0.5)), j1 = Math.min(n - 1, Math.floor(maxY - 0.5));
    let count = 0;
    const xs = [];
    for (let j = j0; j <= j1; j++) {
        const cy = j + 0.5; xs.length = 0;
        for (const r of rings) {
            for (let k = 0, m = r.length - 1; k < r.length; m = k++) {
                const [ax, ay] = r[m], [bx, by] = r[k];
                if ((ay > cy) !== (by > cy)) xs.push(ax + (cy - ay) / (by - ay) * (bx - ax));
            }
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
            const i0 = Math.max(0, Math.ceil(xs[k] - 0.5)), i1 = Math.min(n - 1, Math.ceil(xs[k + 1] - 0.5) - 1);
            for (let i = i0; i <= i1; i++) { fn(i, j); count++; }
        }
    }
    if (count === 0) {                                   // tiny polygon: use its centroid cell
        const ring = rings[0]; let sx = 0, sy = 0;
        for (const [x, y] of ring) { sx += x; sy += y; }
        const i = Math.floor(sx / ring.length), j = Math.floor(sy / ring.length);
        if (i >= 0 && j >= 0 && i < n && j < n) { fn(i, j); count = 1; }
    }
    return count;
}

/** Thick polyline: stamps a disc of `radius` cells along every segment. */
export function drawLine(points, radius, n, fn) {
    const r = Math.max(0.5, radius), r2 = r * r;
    const seen = new Set();
    const stamp = (x, y) => {
        for (let j = Math.floor(y - r); j <= Math.ceil(y + r); j++) {
            if (j < 0 || j >= n) continue;
            for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) {
                if (i < 0 || i >= n) continue;
                const dx = i + 0.5 - x, dy = j + 0.5 - y;
                if (dx * dx + dy * dy <= r2) {
                    const key = j * n + i;
                    if (!seen.has(key)) { seen.add(key); fn(i, j); }
                }
            }
        }
    };
    for (let k = 1; k < points.length; k++) {
        const [ax, ay] = points[k - 1], [bx, by] = points[k];
        if (Math.max(ax, bx) < -r || Math.max(ay, by) < -r || Math.min(ax, bx) > n + r || Math.min(ay, by) > n + r) continue;
        const len = Math.hypot(bx - ax, by - ay), steps = Math.max(1, Math.ceil(len / 0.5));
        for (let s = 0; s <= steps; s++) stamp(ax + (bx - ax) * s / steps, ay + (by - ay) * s / steps);
    }
}
