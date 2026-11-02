// Little isometric voxel towns as SVG, for the welcome page (deterministic per seed).
import { hash2 } from './lib/geo.js';

const PAL = {
    ground: ['#a1887f', '#8d6e63', '#6d4c41'], grass: ['#9ccc65', '#7cb342', '#558b2f'],
    river: ['#4fc3f7', '#29b6f6', '#0288d1'], wall: ['#f5f5f5', '#e0e0e0', '#bdbdbd'],
    roof: ['#ef5350', '#d32f2f', '#b71c1c'], tree: ['#43a047', '#2e7d32', '#1b5e20'],
};

export function isoTown(seed = 1, n = 12, opts = {}) {
    const s = opts.cube || 22, cx = s * 0.866, cy = s * 0.5;
    const cells = [];
    for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) {
        const r = hash2(x, z, seed), river = Math.abs(x - z + ((seed % 5) - 2)) < 1.1 && opts.river !== false;
        const col = [{ t: river ? 'river' : 'ground' }];
        if (!river) {
            const centre = 1 - Math.hypot(x - n / 2, z - n / 2) / (n * 0.75);
            if (r < 0.45 * centre + 0.12) {
                const h = 1 + Math.floor(hash2(x, z, seed + 9) * (1 + 6 * centre * centre));
                for (let k = 0; k < h - 1; k++) col.push({ t: 'wall' });
                col.push({ t: 'roof' });
            } else if (r > 0.82) { col[0].t = 'grass'; col.push({ t: 'tree' }); if (r > 0.93) col.push({ t: 'tree' }); }
            else if (r > 0.66) col[0].t = 'grass';
        }
        cells.push({ x, z, col });
    }
    cells.sort((a, b) => (a.x + a.z) - (b.x + b.z) || a.x - b.x);
    let maxH = 0; for (const c of cells) maxH = Math.max(maxH, c.col.length);
    const W = n * 2 * cx, H = n * 2 * cy + maxH * s + s, ox = n * cx, oy = maxH * s;
    let out = '';
    for (const { x, z, col } of cells) col.forEach(({ t }, y) => {
        const px = ox + (x - z) * cx, py = oy + (x + z) * cy - y * s;
        const [top, left, right] = PAL[t];
        const T = `${px},${py} ${px + cx},${py + cy} ${px},${py + 2 * cy} ${px - cx},${py + cy}`;
        const L = `${px - cx},${py + cy} ${px},${py + 2 * cy} ${px},${py + 2 * cy + s} ${px - cx},${py + cy + s}`;
        const R = `${px + cx},${py + cy} ${px},${py + 2 * cy} ${px},${py + 2 * cy + s} ${px + cx},${py + cy + s}`;
        out += `<polygon points="${L}" fill="${left}"/><polygon points="${R}" fill="${right}"/><polygon points="${T}" fill="${top}"/>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Voxel town illustration">${out}</svg>`;
}

export const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><polygon points="16,3 28,10 16,17 4,10" fill="#fbbf24"/><polygon points="4,10 16,17 16,30 4,23" fill="#d97706"/><polygon points="28,10 16,17 16,30 28,23" fill="#92400e"/><polygon points="16,7.5 21,10.4 16,13.3 11,10.4" fill="#fde68a"/></svg>`;

// =====================================================================
//  Landmarks: small isometric voxel models of each sample city's landmark, plus country flags
// =====================================================================
function shade(hex, k) {
    const v = parseInt(hex.slice(1), 16), c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(x => Math.max(0, Math.min(255, Math.round(x * k))));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
}
/** draw voxels [[x, y, z, '#hex'], …] (y up) as an isometric SVG; hidden faces are skipped */
export function isoVoxels(vox, { cube = 14, label = 'Voxel illustration' } = {}) {
    const cx = cube * 0.866, cy = cube * 0.5, s = cube;
    const key = (x, y, z) => `${x},${y},${z}`, has = new Set(vox.map(([x, y, z]) => key(x, y, z)));
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const P = vox.map(([x, y, z, c]) => {
        const px = (x - z) * cx, py = (x + z) * cy - y * s;
        minX = Math.min(minX, px - cx); maxX = Math.max(maxX, px + cx); minY = Math.min(minY, py); maxY = Math.max(maxY, py + 2 * cy + s);
        return { x, y, z, c, px, py };
    }).sort((a, b) => (a.x + a.z) - (b.x + b.z) || a.y - b.y || a.x - b.x);
    let out = '';
    for (const { x, y, z, c, px, py } of P) {
        if (!has.has(key(x, y, z + 1)))
            out += `<polygon points="${px - cx},${py + cy} ${px},${py + 2 * cy} ${px},${py + 2 * cy + s} ${px - cx},${py + cy + s}" fill="${shade(c, 0.86)}"/>`;
        if (!has.has(key(x + 1, y, z)))
            out += `<polygon points="${px + cx},${py + cy} ${px},${py + 2 * cy} ${px},${py + 2 * cy + s} ${px + cx},${py + cy + s}" fill="${shade(c, 0.7)}"/>`;
        if (!has.has(key(x, y + 1, z)))
            out += `<polygon points="${px},${py} ${px + cx},${py + cy} ${px},${py + 2 * cy} ${px - cx},${py + cy}" fill="${shade(c, 1.08)}"/>`;
    }
    const pad = 4, w = maxX - minX + 2 * pad, h = maxY - minY + 2 * pad;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(minX - pad).toFixed(1)} ${(minY - pad).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${label}">${out}</svg>`;
}

// tiny builder helpers
function scene() {
    const m = new Map();
    const set = (x, y, z, c) => m.set(`${x},${y},${z}`, [x, y, z, c]);
    const del = (x, y, z) => m.delete(`${x},${y},${z}`);
    const box = (x0, y0, z0, x1, y1, z1, c) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) set(x, y, z, c); };
    const hole = (x0, y0, z0, x1, y1, z1) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) del(x, y, z); };
    const tree = (x, z, h = 2, c = '#2e7d32') => { box(x, 1, z, x, h, z, c); };
    return { set, box, hole, tree, list: () => [...m.values()] };
}
const STONE = '#e6dcc4', WHITE = '#f3f4f6', GRASS = '#7cb342', PAVE = '#c9c6bd', WATER = '#38bdf8', ASPHALT = '#3f3f46';

export const LANDMARKS = {
    jakarta() {                                       // Monas: obelisk with the golden flame on a stepped base
        const S = scene();
        S.box(0, 0, 0, 12, 0, 12, GRASS);
        S.box(6, 0, 0, 6, 0, 12, PAVE); S.box(0, 0, 6, 12, 0, 6, PAVE);
        S.box(3, 1, 3, 9, 1, 9, WHITE); S.box(4, 2, 4, 8, 2, 8, '#e5e7eb');
        S.box(6, 3, 6, 6, 13, 6, WHITE);
        S.box(5, 7, 6, 7, 7, 6, WHITE); S.box(6, 7, 5, 6, 7, 7, WHITE);
        S.set(6, 14, 6, '#f5b301'); S.set(6, 15, 6, '#fcd34d');
        [[1, 1], [11, 1], [1, 11], [11, 11], [2, 9], [10, 3], [3, 1], [9, 11]].forEach(([x, z]) => S.tree(x, z, 2));
        return S.list();
    },
    berlin() {                                        // Brandenburger Tor: six columns, entablature, quadriga
        const S = scene();
        S.box(-1, 0, 0, 11, 0, 8, PAVE);
        for (const x of [0, 2, 4, 6, 8, 10]) S.box(x, 1, 3, x, 5, 4, STONE);
        S.box(0, 6, 2, 10, 6, 5, STONE); S.box(2, 7, 3, 8, 7, 4, '#d9cba8');
        S.box(4, 8, 3, 6, 8, 4, '#3f7d64'); S.set(5, 9, 3, '#3f7d64'); S.set(5, 9, 4, '#3f7d64');
        [[-1, 0], [1, 0], [9, 0], [11, 0], [-1, 8], [11, 8]].forEach(([x, z]) => S.tree(x, z, 2, '#3d7a2f'));
        return S.list();
    },
    london() {                                        // Big Ben next to the Thames
        const S = scene();
        S.box(0, 0, 0, 10, 0, 10, PAVE); S.box(9, 0, 0, 12, 0, 10, WATER);
        S.box(1, 1, 5, 8, 3, 9, '#d9c38c'); S.box(1, 4, 5, 8, 4, 9, '#4b5563');
        S.box(2, 1, 1, 3, 11, 2, '#d9c38c');
        S.box(2, 9, 2, 3, 10, 2, '#fef3c7'); S.box(3, 9, 1, 3, 10, 2, '#fef3c7');   // clock faces toward the viewer
        S.box(2, 12, 1, 3, 12, 2, '#475569'); S.box(2, 13, 1, 3, 13, 2, '#3f5a50');
        S.set(2, 14, 2, '#3f5a50'); S.set(2, 15, 2, '#3f5a50'); S.set(2, 16, 2, '#facc15');
        return S.list();
    },
    barcelona() {                                     // Sagrada Família: a cluster of spires with coloured tips
        const S = scene();
        S.box(0, 0, 0, 11, 0, 11, PAVE); S.box(0, 0, 0, 1, 0, 11, GRASS);
        S.box(3, 1, 3, 8, 4, 8, '#c9a66b');
        const spire = (x, z, h, tip) => { S.box(x, 1, z, x, h, z, '#b8935a'); S.set(x, h + 1, z, tip); };
        spire(3, 3, 9, '#ef4444'); spire(4, 2, 11, '#facc15'); spire(7, 2, 11, '#22c55e'); spire(8, 3, 9, '#ef4444');
        spire(3, 8, 8, '#facc15'); spire(8, 8, 8, '#22c55e');
        S.box(5, 5, 5, 6, 14, 6, '#c9a66b'); S.set(5, 15, 5, '#f8fafc'); S.set(6, 15, 6, '#f8fafc'); S.set(5, 16, 5, '#fbbf24');
        return S.list();
    },
    tokyo() {                                         // Shibuya Crossing: zebra stripes between bright towers
        const S = scene();
        S.box(0, 0, 0, 11, 0, 11, ASPHALT);
        for (let k = 3; k <= 8; k += 2) { S.box(k, 0, 4, k, 0, 4, WHITE); S.box(k, 0, 7, k, 0, 7, WHITE); S.box(4, 0, k, 4, 0, k, WHITE); S.box(7, 0, k, 7, 0, k, WHITE); }
        S.box(0, 1, 0, 2, 7, 2, '#9aa0a6'); S.box(2, 4, 0, 2, 5, 2, '#ec4899');
        S.box(9, 1, 0, 11, 11, 2, '#93c5fd'); S.box(9, 8, 2, 11, 9, 2, '#22d3ee');
        S.box(0, 1, 9, 2, 3, 11, '#a3a3a3'); S.box(2, 2, 9, 2, 3, 11, '#facc15');
        S.box(9, 1, 9, 11, 4, 11, '#6b7280'); S.box(9, 3, 9, 9, 4, 11, '#f97316');
        return S.list();
    },
    seoul() {                                         // Gwanghwamun: stone gate, wooden pavilion, curved tiled roof
        const S = scene();
        S.box(-1, 0, -1, 11, 0, 9, PAVE); S.box(-1, 0, 8, 11, 0, 9, GRASS);
        S.box(0, 1, 3, 10, 3, 5, '#9e9a91'); S.hole(4, 1, 3, 6, 2, 5);
        for (const x of [2, 4, 6, 8]) S.box(x, 4, 3, x, 5, 3, '#b03a2e'), S.box(x, 4, 5, x, 5, 5, '#b03a2e');
        S.box(1, 6, 2, 9, 6, 6, '#3f4a4e'); S.box(2, 7, 3, 8, 7, 5, '#3f4a4e'); S.box(3, 8, 4, 7, 8, 4, '#2f3a3e');
        S.set(1, 7, 2, '#3f4a4e'); S.set(9, 7, 2, '#3f4a4e'); S.set(1, 7, 6, '#3f4a4e'); S.set(9, 7, 6, '#3f4a4e');
        [[-1, 9], [1, 0], [9, 0], [11, 9]].forEach(([x, z]) => S.tree(x, z, 2, '#3d7a2f'));
        return S.list();
    },
    singapore() {                                     // Marina Bay Sands: three towers carrying the SkyPark
        const S = scene();
        S.box(0, 0, 0, 12, 0, 6, PAVE); S.box(0, 0, 7, 12, 0, 10, WATER);
        for (const x of [1, 5, 9]) S.box(x, 1, 2, x + 1, 10, 3, '#d6dde3');
        S.box(0, 11, 1, 12, 11, 4, '#475569'); S.box(1, 12, 2, 11, 12, 2, '#22c55e');
        S.box(11, 1, 8, 11, 2, 8, WHITE); S.set(12, 2, 8, WHITE); S.set(10, 2, 8, WHITE);
        [[0, 5], [3, 5], [7, 5], [12, 5]].forEach(([x, z]) => S.tree(x, z, 3, '#7c3aed'));
        return S.list();
    },
    beijing() {                                       // Tiananmen: red wall, gate tower with golden double roof
        const S = scene();
        S.box(0, 0, 0, 12, 0, 10, PAVE);
        S.box(0, 1, 1, 12, 4, 3, '#b3261e'); S.hole(5, 1, 1, 7, 2, 3);
        for (const x of [2, 4, 6, 8, 10]) S.box(x, 5, 3, x, 6, 3, '#b3261e');
        S.box(1, 7, 0, 11, 7, 4, '#e3b23c'); S.box(2, 8, 1, 10, 8, 3, '#d9a12c'); S.box(3, 9, 2, 9, 9, 2, '#e3b23c');
        S.box(6, 1, 9, 6, 7, 9, '#9ca3af'); S.set(7, 7, 9, '#dc2626'); S.set(8, 7, 9, '#dc2626'); S.set(7, 6, 9, '#dc2626'); S.set(8, 6, 9, '#dc2626');
        S.box(0, 1, 6, 0, 2, 6, '#2e7d32'); S.box(12, 1, 6, 12, 2, 6, '#2e7d32');
        return S.list();
    },
};

// ---------- flags (simplified, drawn in SVG so they look the same on every system) ----------
let flagSeq = 0;
function star(cx, cy, r, rot = -90) {
    let d = '';
    for (let k = 0; k < 10; k++) {
        const a = (rot + k * 36) * Math.PI / 180, rr = k % 2 ? r * 0.382 : r;
        d += `${k ? 'L' : 'M'}${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`;
    }
    return d + 'Z';
}
export const FLAGS = {
    id: () => `<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#fff"/><rect width="30" height="10" fill="#ce1126"/></svg>`,
    de: () => `<svg viewBox="0 0 30 18"><rect width="30" height="6" fill="#000"/><rect y="6" width="30" height="6" fill="#dd0000"/><rect y="12" width="30" height="6" fill="#ffce00"/></svg>`,
    gb: () => { const id = 'ukc' + (++flagSeq); return `<svg viewBox="0 0 60 30"><clipPath id="${id}"><path d="M30,15h30v15zv15h-30zh-30v-15zv-15h30z"/></clipPath><rect width="60" height="30" fill="#012169"/><path d="M0,0L60,30M60,0L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0L60,30M60,0L0,30" clip-path="url(#${id})" stroke="#c8102e" stroke-width="4"/><path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/><path d="M30,0v30M0,15h60" stroke="#c8102e" stroke-width="6"/></svg>`; },
    es: () => `<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/><rect x="7" y="7" width="3.5" height="6" rx="0.6" fill="#aa151b" opacity=".85"/></svg>`,
    jp: () => `<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/></svg>`,
    kr: () => {
        const bars = (x, y, rot, pat) => `<g transform="translate(${x} ${y}) rotate(${rot})">${pat.map((b, k) => b ? `<rect x="-2.5" y="${-1.9 + k * 1.3}" width="5" height="0.8"/>` : `<rect x="-2.5" y="${-1.9 + k * 1.3}" width="2.2" height="0.8"/><rect x="0.3" y="${-1.9 + k * 1.3}" width="2.2" height="0.8"/>`).join('')}</g>`;
        return `<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#fff"/><g transform="rotate(33.7 15 10)"><circle cx="15" cy="10" r="5" fill="#0047a0"/><path d="M10,10a5,5 0 0 1 10,0z" fill="#cd2e3a"/><circle cx="12.5" cy="10" r="2.5" fill="#cd2e3a"/><circle cx="17.5" cy="10" r="2.5" fill="#0047a0"/></g><g fill="#000">${bars(6.2, 4.4, -56.3, [1, 1, 1])}${bars(23.8, 15.6, -56.3, [0, 0, 0])}${bars(23.8, 4.4, 56.3, [0, 1, 0])}${bars(6.2, 15.6, 56.3, [1, 0, 1])}</g></svg>`;
    },
    sg: () => `<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#fff"/><rect width="30" height="10" fill="#ef3340"/><circle cx="7" cy="5" r="3.6" fill="#fff"/><circle cx="8.4" cy="5" r="3.3" fill="#ef3340"/><g fill="#fff">${[[11, 2.6], [12.8, 3.9], [12.1, 6], [9.9, 6], [9.2, 3.9]].map(([x, y]) => `<path d="${star(x, y, 0.75)}"/>`).join('')}</g></svg>`,
    cn: () => `<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#ee1c25"/><g fill="#ffff00"><path d="${star(5, 5, 3)}"/>${[[10, 2, 23], [12, 4, 45], [12, 7, 70], [10, 9, 20]].map(([x, y, r]) => `<path d="${star(x, y, 1, r)}"/>`).join('')}</g></svg>`,
};
export const CITY_STYLE = {
    jakarta:   { flag: 'id', country: 'Indonesia',   sky: ['#fde68a', '#fb923c'] },
    berlin:    { flag: 'de', country: 'Germany',     sky: ['#e0e7ff', '#a5b4fc'] },
    london:    { flag: 'gb', country: 'United Kingdom', sky: ['#e2e8f0', '#94a3b8'] },
    barcelona: { flag: 'es', country: 'Spain',       sky: ['#fef3c7', '#fca5a5'] },
    tokyo:     { flag: 'jp', country: 'Japan',       sky: ['#312e81', '#db2777'] },
    seoul:     { flag: 'kr', country: 'South Korea', sky: ['#dbeafe', '#93c5fd'] },
    singapore: { flag: 'sg', country: 'Singapore',   sky: ['#1e3a8a', '#7c3aed'] },
    beijing:   { flag: 'cn', country: 'China',       sky: ['#fee2e2', '#fbbf24'] },
};
