// =====================================================================
//  CAT MAKER — "Create your own cat": pattern, colours, face, or your own photo as the face.
//  Live 3D preview; saved in this browser (localStorage). Several cats can be made; each can be edited or deleted.
// =====================================================================
(function () {
    const PATTERNS = [['solid', 'Solid'], ['tabby', 'Stripes'], ['points', 'Points'], ['calico', 'Patches']];
    const DEFAULT = { name: 'My cat', pattern: 'solid', base: '#ffffff', stripe: '#9ca3af', patch: '#26262a',
                      belly: '#ffffff', eye: '#6fb7e8', face: 'happy', photo: null, photoZoom: 1, photoX: 0, photoY: 0 };
    let spec, photoImg = null, root, renderer, scene, cam, group, raf = 0, angle = 0.6;

    const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

    function build() {
        root = el('div', 'cm-overlay hidden');
        root.innerHTML = `
        <div class="cm-box" role="dialog" aria-modal="true" aria-label="Create your own cat">
          <div class="cm-preview"><canvas id="cm-canvas" width="520" height="520"></canvas>
            <div class="cm-turn"><button data-turn="-1" title="Turn left">⟲</button><button data-turn="1" title="Turn right">⟳</button></div></div>
          <div class="cm-form">
            <h3 id="cm-title">Create your own cat</h3>
            <label class="field">Name</label>
            <input id="cm-name" type="text" maxlength="18">
            <label class="field">Coat pattern</label>
            <div class="seg" id="cm-pattern">${PATTERNS.map(([v, t]) => `<button data-v="${v}">${t}</button>`).join('')}</div>
            <div class="cm-colors">
              <label><input type="color" id="cm-base"><span>Base</span></label>
              <label id="cm-stripe-l"><input type="color" id="cm-stripe"><span id="cm-stripe-t">Stripes</span></label>
              <label id="cm-patch-l"><input type="color" id="cm-patch"><span>Patches</span></label>
              <label><input type="color" id="cm-belly"><span>Belly &amp; paws</span></label>
              <label><input type="color" id="cm-eye"><span>Eyes</span></label>
            </div>
            <label class="field">Face</label>
            <div class="cm-faces" id="cm-face">
              ${Object.entries(CAT_FACES).map(([v, t]) => `<button data-v="${v}">${t}</button>`).join('')}
              <button data-v="photo" class="cm-photo-btn">📷 Give your face!</button>
            </div>
            <div id="cm-photo" class="cm-photo hidden">
              <label class="btn-default cm-upload">Upload photo (PNG / JPG)<input id="cm-file" type="file" accept="image/png,image/jpeg" hidden></label>
              <div id="cm-photo-hint" class="hint" style="margin-top:6px">Your picture becomes the front of the cat's head. It stays on this device.</div>
              <label class="field">Zoom</label><input type="range" id="cm-zoom" min="1" max="3" step="0.05">
              <label class="field">Move left / right</label><input type="range" id="cm-px" min="-1" max="1" step="0.02">
              <label class="field">Move up / down</label><input type="range" id="cm-py" min="-1" max="1" step="0.02">
            </div>
            <div class="cm-actions">
              <button id="cm-reset" class="btn-default">Start over</button>
              <button id="cm-delete" class="btn-default cm-del">Delete cat</button>
              <span style="flex:1"></span>
              <button id="cm-cancel" class="btn-default">Cancel</button>
              <button id="cm-save" class="cm-save">Save &amp; use</button>
            </div>
          </div>
        </div>`;
        document.body.appendChild(root);
        const $ = id => root.querySelector('#' + id);

        $('cm-name').oninput = e => { spec.name = e.target.value; };
        $('cm-pattern').onclick = e => { const v = e.target.dataset.v; if (v) { spec.pattern = v; sync(); } };
        ['base', 'stripe', 'patch', 'belly', 'eye'].forEach(k => $('cm-' + k).oninput = e => { spec[k] = e.target.value; sync(); });
        $('cm-face').onclick = e => { const v = e.target.dataset.v; if (v) { spec.face = v; sync(); } };
        $('cm-file').onchange = e => readPhoto(e.target.files[0]);
        $('cm-zoom').oninput = e => { spec.photoZoom = +e.target.value; sync(); };
        $('cm-px').oninput = e => { spec.photoX = +e.target.value; sync(); };
        $('cm-py').oninput = e => { spec.photoY = +e.target.value; sync(); };
        root.querySelectorAll('[data-turn]').forEach(b => b.onclick = () => { angle += +b.dataset.turn * 0.8; });
        $('cm-reset').onclick = () => { spec = { ...DEFAULT }; photoImg = null; sync(true); };
        $('cm-cancel').onclick = close;
        root.onclick = e => { if (e.target === root) close(); };
        addEventListener('keydown', e => { if (e.key === 'Escape' && !root.classList.contains('hidden')) close(); });
        $('cm-save').onclick = save;
        $('cm-delete').onclick = async () => { if (await window.deleteCustomCat(spec.id)) close(); };
        // drag to turn the preview
        let drag = null; const cv = $('cm-canvas');
        cv.addEventListener('pointerdown', e => { drag = e.clientX; cv.setPointerCapture(e.pointerId); });
        cv.addEventListener('pointermove', e => { if (drag != null) { angle += (e.clientX - drag) * 0.01; drag = e.clientX; } });
        cv.addEventListener('pointerup', () => { drag = null; });
    }

    function readPhoto(file) {
        if (!file) return;
        if (!/^image\/(png|jpe?g)$/.test(file.type)) { APP.flash && APP.flash('Please choose a PNG or JPG image'); return; }
        const fr = new FileReader();
        fr.onload = () => {
            const img = new Image();
            img.onload = () => {
                // keep a small copy (≤ 512 px) so it fits in browser storage
                const k = Math.min(1, 512 / Math.max(img.width, img.height));
                const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                spec.photo = c.toDataURL('image/jpeg', 0.85); spec.face = 'photo';
                spec.photoZoom = 1; spec.photoX = 0; spec.photoY = 0;
                const small = new Image(); small.onload = () => { photoImg = small; sync(true); }; small.src = spec.photo;
            };
            img.src = fr.result;
        };
        fr.readAsDataURL(file);
    }

    function photoCanvas() { return photoImg ? cropFace(photoImg, spec.photoZoom, spec.photoX, spec.photoY) : null; }

    // update the form and the preview cat
    function sync(form) {
        const $ = id => root.querySelector('#' + id);
        if (form) {
            $('cm-name').value = spec.name;
            ['base', 'stripe', 'patch', 'belly', 'eye'].forEach(k => $('cm-' + k).value = spec[k]);
            $('cm-zoom').value = spec.photoZoom; $('cm-px').value = spec.photoX; $('cm-py').value = spec.photoY;
        }
        root.querySelectorAll('#cm-pattern button').forEach(b => b.classList.toggle('active', b.dataset.v === spec.pattern));
        root.querySelectorAll('#cm-face button').forEach(b => b.classList.toggle('active', b.dataset.v === spec.face));
        $('cm-stripe-l').classList.toggle('hidden', spec.pattern === 'solid');
        $('cm-stripe-t').textContent = spec.pattern === 'tabby' ? 'Stripes' : spec.pattern === 'points' ? 'Points' : 'Patches 1';
        $('cm-patch-l').classList.toggle('hidden', spec.pattern !== 'calico');
        const photoMode = spec.face === 'photo';
        $('cm-photo').classList.toggle('hidden', !photoMode);
        root.querySelectorAll('#cm-photo input[type=range]').forEach(r => r.disabled = !photoImg);
        $('cm-photo-hint').textContent = photoImg ? 'Use zoom and move to centre your face. The picture stays on this device.'
            : 'Your picture becomes the front of the cat’s head. It stays on this device.';
        const def = makeCustomCat(spec, photoMode && photoImg ? photoCanvas() : null);
        if (photoMode && !photoImg) def.face = 'happy';                 // until a photo is chosen
        buildCat(group, def);
    }

    function startPreview() {
        const cv = root.querySelector('#cm-canvas');
        if (renderer) { loop(); return; }                 // the preview renderer is reused between openings
        renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.setSize(cv.clientWidth || 260, cv.clientHeight || 260, false);
        scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, 0.72));
        const l = new THREE.DirectionalLight(0xffffff, 0.55); l.position.set(-2, 3, -4); scene.add(l);
        const l2 = new THREE.DirectionalLight(0xffffff, 0.25); l2.position.set(3, 2, 3); scene.add(l2);
        cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
        cam.position.set(0, 1.35, -3.1); cam.lookAt(0, 0.82, 0);
        group = new THREE.Group(); scene.add(group);
        const floor = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshLambertMaterial({ color: 0x3f3f46 }));
        floor.rotation.x = -Math.PI / 2; scene.add(floor);
        loop();
    }
    function loop() {
        raf = requestAnimationFrame(loop);
        group.rotation.y += ((angle) - group.rotation.y) * 0.15;
        renderer.render(scene, cam);
    }

    let editing = false;
    /** open the maker: with an id to edit that cat, without one to make a new cat */
    async function open(id) {
        if (!root) build();
        const saved = id ? window.loadCustomCats().find(c => c.id === id) : null;
        editing = !!saved;
        spec = saved ? { ...DEFAULT, ...saved } : { ...DEFAULT, id: window.newCatId(), name: `My cat ${window.loadCustomCats().length + 1}` };
        root.querySelector('#cm-title').textContent = editing ? `Edit ${spec.name}` : 'Create your own cat';
        root.querySelector('#cm-delete').classList.toggle('hidden', !editing);
        root.querySelector('#cm-save').textContent = editing ? 'Save changes' : 'Save & use';
        photoImg = null;
        if (spec.photo) photoImg = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = spec.photo; });
        root.classList.remove('hidden');
        if (document.pointerLockElement) document.exitPointerLock();
        startPreview();
        angle = 0.6; sync(true);
    }
    function close() {
        root.classList.add('hidden');
        cancelAnimationFrame(raf);
    }
    function save() {
        if (spec.face === 'photo' && !photoImg) { APP.flash && APP.flash('Upload a photo first, or pick another face'); return; }
        if (spec.face !== 'photo') { spec.photo = null; }
        const list = window.loadCustomCats(), k = list.findIndex(c => c.id === spec.id);
        if (k >= 0) list[k] = spec; else list.push(spec);
        const stored = window.saveCustomCats(list);
        const pc = spec.face === 'photo' ? photoCanvas() : null;
        close();
        window.useCustomCat(spec, pc);
        if (!stored && APP.flash) APP.flash('Your cat is used now, but this browser could not store it for next time');
    }
    window.openCatMaker = open;
})();
