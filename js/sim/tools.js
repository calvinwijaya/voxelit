// =====================================================================
//  TOOLS — screenshot, automatic orbit rotation, and "save to Your places"
// =====================================================================
(function () {
    const $ = id => document.getElementById(id);
    const place = () => window.VOXELIT_PLACE || {};

    // ---------- picture of the current view ----------
    /** renders a frame and copies it (WebGL clears its buffer after showing it, so this happens in one go) */
    function capture(maxW = Infinity, caption = true) {
        const r = APP.renderer, src = r.domElement;
        r.render(APP.scene, APP.camera);
        const k = Math.min(1, maxW / src.width), w = Math.round(src.width * k), h = Math.round(src.height * k);
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.drawImage(src, 0, 0, w, h);
        if (caption) {
            const s = Math.max(1, w / 1400), bar = Math.round(46 * s);
            const g = ctx.createLinearGradient(0, h - bar * 1.8, 0, h);
            g.addColorStop(0, 'rgba(9,9,11,0)'); g.addColorStop(1, 'rgba(9,9,11,.82)');
            ctx.fillStyle = g; ctx.fillRect(0, h - bar * 1.8, w, bar * 1.8);
            const p = place(), y = h - bar * 0.42, pad = Math.round(20 * s);
            ctx.textBaseline = 'alphabetic';
            ctx.font = `700 ${Math.round(20 * s)}px Inter, "Segoe UI", sans-serif`; ctx.fillStyle = '#fbbf24';
            ctx.fillText('Voxelit!', pad, y);
            const lw = ctx.measureText('Voxelit!').width;
            ctx.font = `600 ${Math.round(17 * s)}px Inter, "Segoe UI", sans-serif`; ctx.fillStyle = '#f8fafc';
            ctx.fillText(p.name || '', pad + lw + 14 * s, y);
            ctx.font = `${Math.round(14 * s)}px Inter, "Segoe UI", sans-serif`; ctx.fillStyle = '#d4d4d8'; ctx.textAlign = 'right';
            const when = (document.getElementById('current-time-label') || {}).textContent || '';
            ctx.fillText([p.lat != null ? `${(+p.lat).toFixed(5)}, ${(+p.lon).toFixed(5)}` : '', when.split(' · ')[0]].filter(Boolean).join('  ·  '), w - pad, y);
            ctx.textAlign = 'left';
        }
        return cv;
    }
    APP.capture = capture;
    const slug = s => (s || 'voxelit').toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

    function screenshot() {
        const cv = capture();
        cv.toBlob(b => {
            const a = document.createElement('a'), d = new Date();
            a.href = URL.createObjectURL(b);
            a.download = `voxelit_${slug(place().name)}_${d.toISOString().slice(0, 16).replace(/[-:T]/g, '')}.png`;
            a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
            flashShutter();
            window.vxToast ? vxToast('Screenshot saved') : APP.flash && APP.flash('Screenshot saved');
        }, 'image/png');
    }
    function flashShutter() {
        const f = document.createElement('div'); f.className = 'shutter'; document.body.appendChild(f);
        setTimeout(() => f.remove(), 450);
    }

    // ---------- automatic orbit rotation ----------
    // our own rotation (the OrbitControls one assumes 60 fps and slows down on weaker devices): one turn in ~40 s
    let rotating = false;
    const _off = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
    APP.updaters.push(dt => {
        if (!rotating) return;
        if (APP.mode !== 'orbit') return setRotate(false);
        _off.copy(APP.camera.position).sub(APP.controls.target).applyAxisAngle(_up, dt * 0.16);
        APP.camera.position.copy(APP.controls.target).add(_off);
    });
    function setRotate(on) {
        if (on && APP.mode !== 'orbit') APP.enterMode('orbit');
        rotating = on; APP.rotating = on;
        $('tool-rotate').classList.toggle('on', on);
        $('tool-rotate').title = on ? 'Stop rotating' : 'Rotate around automatically';
    }

    // ---------- Your places ----------
    function syncSaved() {
        const p = place(), saved = p.lat != null && VXPlaces.find(p.lat, p.lon, p.size);
        const btns = [$('tool-save'), $('save-btn')];
        btns.forEach(b => { if (!b) return; b.classList.toggle('on', !!saved); b.classList.toggle('hidden', !!p.fromFile || p.lat == null); });
        $('tool-save').title = saved ? 'Saved in Your places — click to remove' : 'Save to Your places';
        if ($('save-btn')) $('save-btn').textContent = saved ? '★ Saved' : '☆ Save place';
    }
    async function toggleSave() {
        const p = place(); if (p.lat == null || p.fromFile) return;
        const saved = VXPlaces.find(p.lat, p.lon, p.size);
        if (saved) {
            const ok = await vxConfirm({ title: `Remove “${saved.name}”?`, text: 'It will no longer be listed in Your places on the home page.',
                                         confirm: 'Remove', cancel: 'Keep', danger: true, imageUrl: saved.thumb });
            if (ok) { VXPlaces.remove(saved.id); syncSaved(); vxToast && vxToast('Removed from Your places'); }
            return;
        }
        const name = await vxPrompt({ title: 'Save to Your places', value: p.name || '', confirm: 'Save', placeholder: 'Name of this place' });
        if (!name) return;
        const thumb = capture(480, false).toDataURL('image/jpeg', 0.72);
        const ok = VXPlaces.save({ name, lat: p.lat, lon: p.lon, size: p.size, thumb });
        syncSaved();
        if (ok && window.vxToast) vxToast(`Saved — find “${name}” on the home page`);
        else if (!ok) APP.flash && APP.flash('This browser has no room left to save places');
    }

    $('tool-shot').onclick = screenshot;
    $('tool-rotate').onclick = () => setRotate(!rotating);
    $('tool-save').onclick = toggleSave;
    if ($('save-btn')) $('save-btn').onclick = toggleSave;
    addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
        if (e.code === 'KeyP' && !e.repeat) screenshot();
    });
    document.addEventListener('voxels-ready', syncSaved);
    document.addEventListener('place-changed', syncSaved);
    syncSaved();
})();
