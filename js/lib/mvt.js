// Minimal Mapbox Vector Tile (v2) decoder — just enough for Voxelit, no dependencies.
// Returns { layerName: { extent, features: [{ type, props, geom }] } }
// geom = array of rings/lines, each an array of [x, y] in tile pixels (0..extent).

class Pbf {
    constructor(buf) { this.buf = buf; this.pos = 0; this.end = buf.length; }
    varint() {
        let val = 0, shift = 0, b;
        do {
            b = this.buf[this.pos++];
            val += (b & 0x7f) * 2 ** shift;           // safe beyond 32 bits
            shift += 7;
        } while (b & 0x80);
        return val;
    }
    svarint() { const v = this.varint(); return v % 2 === 1 ? (v + 1) / -2 : v / 2; }
    bytes() { const len = this.varint(), s = this.pos; this.pos += len; return this.buf.subarray(s, this.pos); }
    string() { return new TextDecoder().decode(this.bytes()); }
    skip(wire) {
        if (wire === 0) this.varint();
        else if (wire === 1) this.pos += 8;
        else if (wire === 2) this.pos += this.varint();
        else if (wire === 5) this.pos += 4;
        else throw new Error('Unsupported protobuf wire type ' + wire);
    }
    fields(fn) {                                       // iterate tag/wire pairs until end
        while (this.pos < this.end) {
            const key = this.varint();
            fn(key >> 3, key & 7);
        }
    }
}

function readValue(bytes) {
    const p = new Pbf(bytes); let v = null;
    p.fields((tag, wire) => {
        const dv = new DataView(p.buf.buffer, p.buf.byteOffset);
        if (tag === 1) v = p.string();
        else if (tag === 2) { v = dv.getFloat32(p.pos, true); p.pos += 4; }
        else if (tag === 3) { v = dv.getFloat64(p.pos, true); p.pos += 8; }
        else if (tag === 4 || tag === 5) v = p.varint();
        else if (tag === 6) v = p.svarint();
        else if (tag === 7) v = !!p.varint();
        else p.skip(wire);
    });
    return v;
}

function packed(p) {
    const len = p.varint(), end = p.pos + len, out = [];
    while (p.pos < end) out.push(p.varint());
    return out;
}

function decodeGeometry(cmds) {
    const parts = []; let cur = null, x = 0, y = 0, i = 0;
    while (i < cmds.length) {
        const c = cmds[i++], id = c & 7, count = c >> 3;
        if (id === 1 || id === 2) {
            for (let k = 0; k < count; k++) {
                x += zz(cmds[i++]); y += zz(cmds[i++]);
                if (id === 1) { cur = []; parts.push(cur); }
                cur.push([x, y]);
            }
        } else if (id === 7) {
            if (cur && cur.length) cur.push([cur[0][0], cur[0][1]]);
        }
    }
    return parts;
}
const zz = v => (v >>> 1) ^ -(v & 1);

export function decodeMVT(buf) {
    const layers = {};
    const p = new Pbf(buf);
    p.fields((tag, wire) => {
        if (tag !== 3) return p.skip(wire);
        const lp = new Pbf(p.bytes());
        let name = '', extent = 4096; const keys = [], values = [], raw = [];
        lp.fields((t, w) => {
            if (t === 1) name = lp.string();
            else if (t === 2) raw.push(lp.bytes());
            else if (t === 3) keys.push(lp.string());
            else if (t === 4) values.push(readValue(lp.bytes()));
            else if (t === 5) extent = lp.varint();
            else lp.skip(w);
        });
        const features = raw.map(fb => {
            const fp = new Pbf(fb); let tags = [], type = 0, geometry = [];
            fp.fields((t, w) => {
                if (t === 2) tags = packed(fp);
                else if (t === 3) type = fp.varint();
                else if (t === 4) geometry = packed(fp);
                else fp.skip(w);
            });
            const props = {};
            for (let k = 0; k + 1 < tags.length; k += 2) props[keys[tags[k]]] = values[tags[k + 1]];
            return { type, props, geom: decodeGeometry(geometry) };   // type: 1 point, 2 line, 3 polygon
        });
        layers[name] = { extent, features };
    });
    return layers;
}
