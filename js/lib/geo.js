// Tile maths and a local metric frame around the selected point.
const R = 6378137;
const D2R = Math.PI / 180;

export function lonLatToTileF(lon, lat, z) {
    const n = 2 ** z, s = Math.sin(lat * D2R);
    return [(lon + 180) / 360 * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}
export function tileFToLonLat(x, y, z) {
    const n = 2 ** z;
    const lon = x / n * 360 - 180;
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) / D2R;
    return [lon, lat];
}

/**
 * The voxel grid: a square of `size` metres centred on (lon, lat), cells of `voxel` metres.
 * Grid x runs east, grid z runs south (three.js convention: north = -z).
 * Positions are kept in fractional grid units so rasterising is just "which cell centre is inside".
 */
export class Frame {
    constructor(lon, lat, size, voxel) {
        this.lon = lon; this.lat = lat; this.size = size; this.voxel = voxel;
        this.n = Math.round(size / voxel);
        this.k = Math.cos(lat * D2R);                     // Mercator → true metres at this latitude
        this.mx0 = R * lon * D2R;
        this.my0 = R * Math.log(Math.tan(Math.PI / 4 + lat * D2R / 2));
        const h = size / 2 / 111320;
        const w = size / 2 / (111320 * this.k);
        this.bbox = [lon - w, lat - h, lon + w, lat + h];
    }
    /** fractional tile coordinate (any zoom) → fractional grid coordinate [gx, gz] */
    fromTile(X, Y, z) {
        const C = 2 * Math.PI * R, n = 2 ** z;
        const mx = X / n * C - C / 2, my = C / 2 - Y / n * C;
        const east = (mx - this.mx0) * this.k, north = (my - this.my0) * this.k;
        return [(east + this.size / 2) / this.voxel, (this.size / 2 - north) / this.voxel];
    }
    /** centre of grid cell (i, j) → [lon, lat] */
    cellLonLat(i, j) {
        const east = (i + 0.5) * this.voxel - this.size / 2;
        const north = this.size / 2 - (j + 0.5) * this.voxel;
        const lon = (this.mx0 + east / this.k) / R / D2R;
        const lat = (2 * Math.atan(Math.exp((this.my0 + north / this.k) / R)) - Math.PI / 2) / D2R;
        return [lon, lat];
    }
    /** integer tiles at zoom z covering the frame */
    tiles(z) {
        const [x0, y0] = lonLatToTileF(this.bbox[0], this.bbox[3], z);
        const [x1, y1] = lonLatToTileF(this.bbox[2], this.bbox[1], z);
        const out = [];
        for (let x = Math.floor(x0); x <= Math.floor(x1); x++)
            for (let y = Math.floor(y0); y <= Math.floor(y1); y++) out.push({ x, y, z });
        return out;
    }
}

// cheap deterministic per-cell noise in [0, 1)
export function hash2(i, j, seed = 0) {
    let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
