// .vxl.gz read/write — the "VXL2" format of Voxel-FT-UGM (tools/compress_voxels.py):
//    0  4  magic "VXL2"
//    4 12  nx, ny, nz          uint32  (Y = height)
//   16 12  x0, y0, z0          int32   index offset
//   28  4  voxel size (m)      float32
//   32  1  nTypes, then per type: uint8 length + ASCII name
//   ..     nx*nz*ny bytes, 0 = empty, k = type k-1, index = (x*nz + z)*ny + y
// Voxelit appends an optional footer after the voxels: "GEO1" + uint32 length + UTF-8 JSON
// (centre lon/lat, area, ground elevation…). Older readers stop after the voxels and ignore it.

export function encodeVXL(grid, meta = null) {
    const { nx, ny, nz, data, types, voxel } = grid;
    const names = types.map(t => new TextEncoder().encode(t));
    const headLen = 33 + names.reduce((s, b) => s + 1 + b.length, 0);
    const foot = meta ? new TextEncoder().encode(JSON.stringify(meta)) : null;
    const out = new Uint8Array(headLen + data.length + (foot ? 8 + foot.length : 0));
    const dv = new DataView(out.buffer);
    out.set([86, 88, 76, 50], 0);                                   // "VXL2"
    dv.setUint32(4, nx, true); dv.setUint32(8, ny, true); dv.setUint32(12, nz, true);
    dv.setInt32(16, grid.x0 || 0, true); dv.setInt32(20, grid.y0 || 0, true); dv.setInt32(24, grid.z0 || 0, true);
    dv.setFloat32(28, voxel, true);
    let p = 32; out[p++] = names.length;
    for (const b of names) { out[p++] = b.length; out.set(b, p); p += b.length; }
    out.set(data, p); p += data.length;
    if (foot) {
        out.set([71, 69, 79, 49], p);                               // "GEO1"
        dv.setUint32(p + 4, foot.length, true); out.set(foot, p + 8);
    }
    return out;
}

export function decodeVXL(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const magic = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
    let nx, ny, nz, x0, y0, z0, voxel = null, p;
    if (magic === 'VXL1') {
        nx = dv.getUint16(4, true); ny = dv.getUint16(6, true); nz = dv.getUint16(8, true);
        x0 = dv.getInt16(10, true); y0 = dv.getInt16(12, true); z0 = dv.getInt16(14, true); p = 16;
    } else if (magic === 'VXL2') {
        nx = dv.getUint32(4, true); ny = dv.getUint32(8, true); nz = dv.getUint32(12, true);
        x0 = dv.getInt32(16, true); y0 = dv.getInt32(20, true); z0 = dv.getInt32(24, true);
        voxel = dv.getFloat32(28, true); p = 32;
    } else throw new Error('This is not a .vxl file (expected VXL1 or VXL2)');
    const types = []; const nTypes = u8[p++];
    for (let t = 0; t < nTypes; t++) {
        const len = u8[p++];
        types.push(String.fromCharCode(...u8.subarray(p, p + len))); p += len;
    }
    const size = nx * ny * nz;
    if (p + size > u8.length) throw new Error('The .vxl file is truncated');
    const data = u8.slice(p, p + size); p += size;
    let meta = null;
    if (u8.length >= p + 8 && String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]) === 'GEO1') {
        const len = dv.getUint32(p + 4, true);
        try { meta = JSON.parse(new TextDecoder().decode(u8.subarray(p + 8, p + 8 + len))); } catch { /* ignore */ }
    }
    return { nx, ny, nz, x0, y0, z0, voxel: voxel || 2, types, data, meta };
}

export async function gzip(u8) {
    const s = new Blob([u8]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
}
export async function maybeGunzip(u8) {
    if (u8[0] !== 0x1f || u8[1] !== 0x8b) return u8;
    const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
}
