// Runs the solar analysis off the main thread (see solar-core.js for the model).
importScripts('solar-core.js');
onmessage = ({ data: m }) => {
    try {
        let last = 0;
        const r = solarCompute({ data: m.data, nx: m.nx, ny: m.ny, nz: m.nz }, m.suns, f => {
            const now = Date.now(); if (now - last > 120) { last = now; postMessage({ type: 'progress', id: m.id, f }); }
        });
        postMessage({ type: 'result', id: m.id, ...r }, [r.idx.buffer, r.val.buffer, r.code.buffer]);
    } catch (e) { postMessage({ type: 'error', id: m.id, message: e.message }); }
};
