// =====================================================================
//  CATS — third-person avatars (coat pattern + facial expression)
//  buildCat(group, def) fills a THREE.Group with a blocky cat (forward = -Z,
//  feet at y = 0) and returns the animated parts { head, legs, tail, wings }.
//  The "Cat Avatar" panel (thumbnails rendered on the fly) is wired at the end.
// =====================================================================
(function () {
    const CATS = window.CATS = [
        { id: 'oyen', name: 'Oyen', breed: 'Orange tabby', mood: 'Happy', face: 'happy', pattern: 'tabby',
          fur: 0xe8862a, fur2: 0xa94f12, belly: 0xfff1dc, muzzle: 0xfff1dc, nose: 0xf29bb0, eye: 0x7cc243,
          earIn: 0xf29bb0, paw: 0xfff1dc, line: 0x3b2314, feather: 0xfffaf0, feather2: 0xf3e6cc, ui: '#fb923c' },
        { id: 'mochi', name: 'Mochi', breed: 'White', mood: 'Lazy', face: 'lazy', pattern: 'solid',
          fur: 0xf6f5f1, fur2: 0xe4e0d8, belly: 0xffffff, muzzle: 0xffffff, nose: 0xf4a3b5, eye: 0x6fb7e8,
          earIn: 0xf6b3c2, paw: 0xffffff, line: 0x7a6f68, feather: 0xffffff, feather2: 0xeef2f7, ui: '#e5e7eb' },
        { id: 'kopi', name: 'Kopi', breed: 'Black', mood: 'Angry', face: 'angry', pattern: 'solid',
          fur: 0x1f1f24, fur2: 0x2b2b31, belly: 0x29292f, muzzle: 0x2e2e34, nose: 0x45454d, eye: 0xf2c230,
          earIn: 0x4a3a42, paw: 0x26262b, line: 0x9a9aa3, feather: 0x3d3d45, feather2: 0x2c2c33, ui: '#9ca3af' },
        { id: 'bolu', name: 'Bolu', breed: 'Himalayan', mood: 'Grumpy', face: 'grumpy', pattern: 'points', fluffy: true,
          fur: 0xf2e6cf, fur2: 0x5a3b28, belly: 0xfaf3e4, muzzle: 0x5a3b28, nose: 0x2e1d12, eye: 0x4aa3e0,
          earIn: 0x7a5038, paw: 0x5a3b28, line: 0xd8c3a5, feather: 0xfff8ea, feather2: 0xf1e4cb, ui: '#d6c3a1' },
        { id: 'belang', name: 'Belang', breed: 'Calico (tri-colour)', mood: 'Surprised', face: 'surprised', pattern: 'calico',
          fur: 0xfff8ef, fur2: 0xe8862a, fur3: 0x26262a, belly: 0xffffff, muzzle: 0xffffff, nose: 0xf29bb0, eye: 0xd9a520,
          earIn: 0xf29bb0, paw: 0xffffff, line: 0x2b2b2b, feather: 0xfffaf0, feather2: 0xf3e6cc, ui: '#f59e0b' },
        { id: 'abu', name: 'Abu', breed: 'Russian Blue (grey)', mood: 'Smug', face: 'smug', pattern: 'solid',
          fur: 0x7d8a99, fur2: 0x6a7684, belly: 0x9aa5b1, muzzle: 0xa3adb8, nose: 0x59606b, eye: 0x6ccf6a,
          earIn: 0x8f8a99, paw: 0x9aa5b1, line: 0x2f353d, feather: 0xe8edf3, feather2: 0xcfd7e1, ui: '#94a3b8' }
    ];

    // face layers (head front face is at z = -0.23)
    const DECOR_Z = -0.235, EYE_Z = -0.244, PUP_Z = -0.252, MOUTH_Z = -0.286;

    window.buildCat = function (root, d) {
        // clear the previous cat
        root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
        while (root.children.length) root.remove(root.children[0]);

        const mats = {};
        const M = hex => mats[hex] || (mats[hex] = new THREE.MeshLambertMaterial({ color: hex }));
        const part = (w, h, dd, col, x, y, z, parent, rz = 0) => {
            const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), M(col));
            b.position.set(x, y, z); b.rotation.z = rz; b.castShadow = true; (parent || root).add(b); return b;
        };
        const F = d.fur, F2 = d.fur2, fl = d.fluffy ? 1.1 : 1;
        const points = d.pattern === 'points', calico = d.pattern === 'calico';

        // ---------- body ----------
        part(0.62 * fl, 0.52 * fl, 1.15, F, 0, 0.74, 0);
        part(0.5, 0.06, 0.8, d.belly, 0, 0.47, -0.05);
        if (d.pattern === 'tabby') {
            [-0.36, -0.12, 0.12, 0.36].forEach(z => part(0.64, 0.3, 0.09, F2, 0, 0.86, z));
            part(0.08, 0.02, 1.0, F2, 0, 1.005, 0.02);
        }
        if (calico) {
            part(0.33, 0.36, 0.48, F2, -0.16, 0.86, -0.12);          // orange patch, left shoulder
            part(0.33, 0.3, 0.42, d.fur3, 0.16, 0.88, 0.26);          // black patch, right hip
            part(0.2, 0.2, 0.2, d.fur3, -0.2, 0.93, 0.36);
        }
        if (d.fluffy) {
            part(0.72, 0.46, 0.24, d.belly, 0, 0.8, -0.56);           // chest ruff
            part(0.7, 0.3, 0.3, F, 0, 0.98, 0.45);                    // fluffy back
        }

        // ---------- head ----------
        const head = new THREE.Group(); head.position.set(0, 1.0, -0.66); root.add(head);
        part(0.56 * fl, 0.46, 0.46, F, 0, 0, 0, head);
        if (d.fluffy) [-1, 1].forEach(s => part(0.12, 0.26, 0.3, F, 0.33 * s, -0.08, 0.02, head));   // cheek fluff
        if (calico) part(0.29, 0.475, 0.475, d.fur3, -0.14, 0.003, 0.003, head);                     // half black face
        if (points && d.face !== 'photo') part(0.36, 0.3, 0.01, F2, 0, -0.02, DECOR_Z, head);       // dark mask
        if (d.pattern === 'tabby' && d.face !== 'photo') [-0.1, 0, 0.1].forEach(x => part(0.04, 0.12, 0.01, F2, x, 0.17, DECOR_Z, head)); // "M"
        const photo = d.face === 'photo' && d.photoCanvas;
        if (!photo) {
            part(0.32, 0.16, 0.06, d.muzzle, 0, -0.1, -0.25, head);
            part(0.08, 0.05, 0.03, d.nose, 0, -0.03, -0.285, head);
        }
        [-1, 1].forEach(s => {
            const ear = new THREE.Group(); ear.position.set(0.17 * s, 0.27, 0.02); ear.rotation.z = -0.22 * s; head.add(ear);
            const earCol = points ? F2 : calico ? (s < 0 ? d.fur3 : F2) : F;
            part(0.17, 0.18, 0.08, earCol, 0, 0.06, 0, ear);
            part(0.09, 0.11, 0.02, d.earIn, 0, 0.05, -0.045, ear);
            if (!photo) part(0.06, 0.03, 0.12, d.muzzle, 0.27 * s, -0.12, -0.2, head);      // whisker pads
        });
        if (photo) photoFace(d, head, fl); else face(d, part, head);

        // ---------- legs ----------
        const legs = [];
        [[-0.2, -0.38], [0.2, -0.38], [-0.2, 0.38], [0.2, 0.38]].forEach(([x, z], i) => {
            const g = new THREE.Group(); g.position.set(x, 0.52, z); root.add(g);
            const legCol = calico ? [F, F2, d.fur3, F][i] : F;
            part(0.17 * fl, 0.46, 0.17 * fl, legCol, 0, -0.23, 0, g);
            if (d.pattern === 'tabby') part(0.17, 0.06, 0.17, F2, 0, -0.2, 0, g);
            if (points) part(0.175 * fl, 0.24, 0.175 * fl, F2, 0, -0.34, 0, g);
            part(0.18 * fl, 0.07, 0.21, d.paw, 0, -0.485, -0.02, g);
            legs.push(g);
        });

        // ---------- tail ----------
        const tail = []; let parent = root;
        const tw = d.fluffy ? 0.18 : 0.12;
        for (let k = 0; k < 5; k++) {
            const g = new THREE.Group();
            g.position.set(0, k === 0 ? 0.88 : 0, k === 0 ? 0.56 : 0.24);
            parent.add(g);
            let col = F;
            if (d.pattern === 'tabby') col = k % 2 ? F2 : F;
            if (points) col = k ? F2 : F;
            if (calico) col = [F, F2, F2, d.fur3, d.fur3][k];
            part(tw, tw, 0.26, col, 0, 0, 0.12, g);
            if (k === 4 && d.pattern === 'tabby') part(tw, tw, 0.08, d.belly, 0, 0, 0.27, g);
            tail.push(g); parent = g;
        }

        // ---------- wings (shown in fly mode) ----------
        const wings = [-1, 1].map(s => {
            const w = new THREE.Group(); w.position.set(0.3 * s, 0.98, -0.18); root.add(w);
            const arm = new THREE.Group(); w.add(arm);
            [[0.95, 0.22, 0], [0.8, 0.2, 0.18], [0.6, 0.18, 0.34]].forEach(([len, wd, z], r) => {
                part(len, 0.05, wd, r ? d.feather2 : d.feather, (len / 2 + 0.02) * s, 0.02 - r * 0.015, z, arm);
            });
            part(0.25, 0.08, 0.2, d.feather, 0.12 * s, 0.03, -0.04, arm);
            w.visible = false; w.userData = { s, arm, grow: 0 };
            return w;
        });
        return { head, legs, tail, wings };
    };

    // ---------- "Give your face": the uploaded picture as the front of the head ----------
    function photoFace(d, head, fl) {
        let tex = d._tex;
        if (!tex || tex.image !== d.photoCanvas) { tex = d._tex = new THREE.CanvasTexture(d.photoCanvas); }
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.54 * fl, 0.44),
            new THREE.MeshLambertMaterial({ map: tex, transparent: true }));
        plane.rotation.y = Math.PI;                       // face forward (-Z)
        plane.position.set(0, 0, -0.2325);
        head.add(plane);
    }

    // ---------- facial expressions ----------
    function face(d, part, head) {
        const L = d.line, E = d.eye, K = 0x111111;
        const openEye = (x, w = 0.11, h = 0.1, y = 0.06, pw = 0.03, ph = 0.09) => {
            part(w, h, 0.012, E, x, y, EYE_Z, head);
            part(pw, Math.min(ph, h - 0.01), 0.012, K, x, y, PUP_Z, head);
            part(0.025, 0.025, 0.012, 0xffffff, x + w / 2 - 0.025, y + h / 2 - 0.022, PUP_Z - 0.001, head);  // sparkle
        };
        const line = (w, x, y, rz = 0, z = MOUTH_Z, col = L, h = 0.02) => part(w, h, 0.01, col, x, y, z, head, rz);

        switch (d.face) {
            case 'happy':                                     // bright eyes, "w" smile
                [-0.13, 0.13].forEach(x => openEye(x));
                line(0.07, -0.032, -0.135, -0.5); line(0.07, 0.032, -0.135, 0.5);
                break;
            case 'lazy':                                      // heavy half-closed lids, flat mouth
                [-0.13, 0.13].forEach(x => {
                    part(0.11, 0.045, 0.012, E, x, 0.035, EYE_Z, head);
                    part(0.03, 0.04, 0.012, K, x, 0.035, PUP_Z, head);
                    part(0.13, 0.06, 0.016, d.fur2, x, 0.082, PUP_Z - 0.002, head);   // eyelid
                    line(0.13, x, 0.052, 0, PUP_Z - 0.004, L, 0.014);                // lid edge
                });
                line(0.09, 0, -0.135);
                break;
            case 'angry':                                     // slanted brows, slit pupils, frown + fangs
                [-0.13, 0.13].forEach(x => {
                    openEye(x, 0.11, 0.08, 0.05, 0.022, 0.075);
                    line(0.16, x, 0.118, 0.45 * Math.sign(x), PUP_Z - 0.002, L, 0.03);
                });
                line(0.07, -0.03, -0.14, 0.5); line(0.07, 0.03, -0.14, -0.5);
                [-0.04, 0.04].forEach(x => part(0.022, 0.035, 0.01, 0xffffff, x, -0.165, MOUTH_Z, head));
                break;
            case 'grumpy':                                    // droopy brows, narrowed eyes, wide frown
                [-0.13, 0.13].forEach(x => {
                    openEye(x, 0.11, 0.06, 0.045, 0.03, 0.055);
                    line(0.15, x, 0.095, -0.25 * Math.sign(x), PUP_Z - 0.002, L, 0.04);
                });
                line(0.09, -0.04, -0.14, 0.35); line(0.09, 0.04, -0.14, -0.35);
                break;
            case 'surprised':                                 // big round eyes, raised brows, "o" mouth
                [-0.13, 0.13].forEach(x => {
                    openEye(x, 0.13, 0.13, 0.06, 0.075, 0.075);
                    line(0.09, x, 0.165, 0, DECOR_Z - 0.002, L, 0.022);
                });
                part(0.06, 0.065, 0.01, 0x3a1010, 0, -0.15, MOUTH_Z, head);
                break;
            case 'sad':                                       // brows up in the middle, eyes down, frown, a tear
                [-0.13, 0.13].forEach(x => {
                    openEye(x, 0.1, 0.09, 0.045, 0.034, 0.06);
                    line(0.13, x, 0.125, -0.4 * Math.sign(x), PUP_Z - 0.002, L, 0.026);   // inner ends raised
                });
                line(0.07, -0.03, -0.15, 0.45); line(0.07, 0.03, -0.15, -0.45);
                part(0.03, 0.06, 0.01, 0x7dd3fc, -0.16, -0.02, PUP_Z - 0.003, head);   // tear
                break;
            case 'smug':                                      // wink + smirk
                line(0.12, -0.13, 0.05, 0.12, EYE_Z, L, 0.024);
                openEye(0.13, 0.11, 0.075, 0.05, 0.03, 0.07);
                part(0.13, 0.04, 0.016, d.fur2, 0.13, 0.098, PUP_Z - 0.002, head);    // half lid
                line(0.1, 0.035, -0.132, 0.35);
                break;
        }
    }

    // ---------- custom cat ("Create your own") ----------
    const hex = h => parseInt(String(h).replace('#', ''), 16);
    const lum = h => { const v = hex(h); return (0.299 * (v >> 16 & 255) + 0.587 * (v >> 8 & 255) + 0.114 * (v & 255)) / 255; };
    /** turn the simple choices of the cat maker into a full cat definition */
    window.makeCustomCat = function (spec, photoCanvas) {
        const dark = lum(spec.base) < 0.35;
        return {
            id: spec.id, name: spec.name || 'My cat', breed: 'Your own cat', custom: true,
            mood: spec.face === 'photo' ? 'Your face!' : (FACES[spec.face] || 'Happy'),
            face: spec.face, pattern: spec.pattern, photoCanvas: spec.face === 'photo' ? photoCanvas : null,
            fur: hex(spec.base), fur2: hex(spec.stripe), fur3: hex(spec.patch), belly: hex(spec.belly),
            muzzle: spec.pattern === 'points' ? hex(spec.stripe) : hex(spec.belly),
            paw: spec.pattern === 'points' ? hex(spec.stripe) : hex(spec.belly),
            nose: 0xf29bb0, eye: hex(spec.eye), earIn: 0xf29bb0, line: dark ? 0xb4b4bc : 0x3b2314,
            feather: 0xfffaf0, feather2: 0xf3e6cc, ui: lum(spec.base) < 0.25 ? '#9ca3af' : spec.base
        };
    };
    const FACES = window.CAT_FACES = { happy: 'Happy', sad: 'Sad', angry: 'Angry', grumpy: 'Grumpy', surprised: 'Surprised', lazy: 'Lazy', smug: 'Smug' };
    // your own cats: a list in localStorage (the first version stored a single cat; it is moved over)
    const STORE = 'voxelit.customCats', OLD = 'voxelit.customCat';
    window.loadCustomCats = function () {
        try {
            let list = JSON.parse(localStorage.getItem(STORE) || '[]');
            const old = localStorage.getItem(OLD);
            if (old) { const c = JSON.parse(old); c.id = c.id && c.id !== 'custom' ? c.id : 'custom-1'; list.push(c);
                       localStorage.setItem(STORE, JSON.stringify(list)); localStorage.removeItem(OLD);
                       if (localStorage.getItem('voxel.cat') === 'custom') localStorage.setItem('voxel.cat', c.id); }
            return list;
        } catch (e) { return []; }
    };
    window.saveCustomCats = function (list) {
        try { localStorage.setItem(STORE, JSON.stringify(list)); return true; } catch (e) { return false; }   // storage full
    };
    window.newCatId = () => 'custom-' + Date.now().toString(36);
    /** photo (data URL) → canvas texture cropped to the face shape */
    window.loadPhotoCanvas = function (spec) {
        return new Promise(res => {
            if (!spec || !spec.photo) return res(null);
            const img = new Image();
            img.onload = () => res(window.cropFace(img, spec.photoZoom || 1, spec.photoX || 0, spec.photoY || 0));
            img.onerror = () => res(null);
            img.src = spec.photo;
        });
    };
    window.cropFace = function (img, zoom = 1, ox = 0, oy = 0) {
        const W = 270, H = 220, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const ctx = cv.getContext('2d');
        const s = Math.max(W / img.width, H / img.height) * zoom;            // cover, then zoom in
        const w = img.width * s, h = img.height * s;
        ctx.drawImage(img, (W - w) / 2 + ox * (w - W) / 2, (H - h) / 2 + oy * (h - H) / 2, w, h);
        return cv;
    };

    // ---------- "Cat Avatar" panel ----------
    let choice = 'oyen';
    try { choice = localStorage.getItem('voxel.cat') || choice; } catch (e) { }
    window.CAT_CHOICE = choice;

    function putCat(def) {                       // add or replace a custom cat in the list of avatars
        const k = CATS.findIndex(c => c.id === def.id);
        if (k >= 0) CATS[k] = def; else CATS.push(def);
    }
    // one small renderer, kept for the whole visit (making a new WebGL context per thumbnail runs out of contexts)
    let thumbR = null, thumbScene, thumbCam, thumbGroup;
    function thumbnail(defs) {
        const out = {};
        try {
            if (!thumbR) {
                thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
                thumbR.setSize(160, 160, false);
                thumbScene = new THREE.Scene();
                thumbScene.add(new THREE.AmbientLight(0xffffff, 0.7));
                const l = new THREE.DirectionalLight(0xffffff, 0.55); l.position.set(-2, 3, -4); thumbScene.add(l);
                thumbCam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
                thumbCam.position.set(-1.25, 1.42, -2.55); thumbCam.lookAt(0, 0.92, -0.45);
                thumbGroup = new THREE.Group(); thumbScene.add(thumbGroup);
            }
            defs.forEach(c => {
                const parts = buildCat(thumbGroup, c);
                parts.tail.forEach((t, k) => t.rotation.x = k === 0 ? -0.9 : -0.2);
                thumbR.render(thumbScene, thumbCam);
                out[c.id] = thumbR.domElement.toDataURL('image/png');
            });
        } catch (e) { console.warn('Cat thumbnails unavailable', e); }
        return out;
    }
    let thumbs = {};
    function select(id, quiet) {
        choice = id; window.CAT_CHOICE = id;
        try { localStorage.setItem('voxel.cat', id); } catch (e) { }
        document.querySelectorAll('#cat-grid .cat-card[data-id]').forEach(x => x.classList.toggle('active', x.dataset.id === id));
        if (APP.setCat) APP.setCat(id);
        const c = CATS.find(c => c.id === id);
        if (!quiet && c && APP.flash) APP.flash(`${c.name} is ready${APP.mode === 'tp' ? '' : ' — switch to Third person'}`);
    }
    function render() {
        const box = document.getElementById('cat-grid'); if (!box) return;
        box.innerHTML = '';
        CATS.forEach(c => {
            const b = document.createElement('button');
            b.className = 'cat-card' + (c.id === choice ? ' active' : '');
            b.dataset.id = c.id;
            b.style.setProperty('--cat', c.ui);
            b.innerHTML = (thumbs[c.id] ? `<img src="${thumbs[c.id]}" alt="">` : `<span class="cat-swatch"></span>`) +
                `<b>${c.name.replace(/[<>&]/g, '')}</b><span>${c.breed}</span><em>${c.mood}</em>` +
                (c.custom ? '<span class="cat-tools"><i class="cat-edit" data-act="edit" title="Edit this cat">✎</i><i class="cat-del" data-act="delete" title="Delete this cat">🗑</i></span>' : '');
            b.onclick = e => {
                const act = e.target.dataset.act;
                if (act === 'edit') return window.openCatMaker && openCatMaker(c.id);
                if (act === 'delete') return window.deleteCustomCat(c.id);
                select(c.id);
            };
            box.appendChild(b);
        });
        const add = document.createElement('button');
        add.className = 'cat-card cat-add';
        add.innerHTML = `<span class="plus">+</span><b>Create your own</b><span>colours, pattern, face — or your photo</span>`;
        add.onclick = () => window.openCatMaker && openCatMaker(null);
        box.appendChild(add);
    }
    /** called by the cat maker after saving (new cat or edited one) */
    window.useCustomCat = function (spec, photoCanvas) {
        const def = makeCustomCat(spec, photoCanvas);
        putCat(def);
        Object.assign(thumbs, thumbnail([def]));
        render(); select(def.id);
    };
    window.deleteCustomCat = async function (id) {
        const c = CATS.find(c => c.id === id); if (!c) return false;
        const ok = await vxConfirm({ title: `Delete ${c.name}?`, text: 'This cat will be removed from this browser. This cannot be undone.',
                                     confirm: 'Delete cat', cancel: 'Keep it', danger: true, imageUrl: thumbs[id] });
        if (!ok) return false;
        CATS.splice(CATS.indexOf(c), 1);
        saveCustomCats(loadCustomCats().filter(s => s.id !== id));
        delete thumbs[id];
        if (choice === id) select('oyen', true);
        render();
        if (window.vxToast) vxToast(`${c.name} was deleted`); else if (APP.flash) APP.flash(`${c.name} was deleted`);
        return true;
    };

    async function init() {
        for (const spec of loadCustomCats()) putCat(makeCustomCat(spec, await loadPhotoCanvas(spec)));
        try { choice = localStorage.getItem('voxel.cat') || choice; } catch (e) { }      // may have changed while moving old saves
        if (!CATS.some(c => c.id === choice)) choice = 'oyen';
        window.CAT_CHOICE = choice;
        thumbs = thumbnail(CATS);
        render();
        if (APP.setCat) APP.setCat(choice);
    }
    // the viewer loads these scripts after the page is ready, so don't wait for DOMContentLoaded
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
