// "Your places": areas the user saved from the viewer, kept in this browser (localStorage).
// Shared by the home page, the world map and the viewer. Each place: {id, name, lat, lon, size, saved, thumb}
(function () {
    const KEY = 'voxelit.places', MAX = 60;
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
    const write = list => { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; } };
    const same = (p, lat, lon, size) => Math.abs(p.lat - lat) < 1e-5 && Math.abs(p.lon - lon) < 1e-5 && +p.size === +size;

    window.VXPlaces = {
        list: () => read().sort((a, b) => b.saved - a.saved),
        find: (lat, lon, size) => read().find(p => same(p, lat, lon, size)) || null,
        /** returns the stored place, or null when the browser's storage is full */
        save(place) {
            let list = read().filter(p => p.id !== place.id && !same(p, place.lat, place.lon, place.size));
            const p = { id: place.id || 'p' + Date.now().toString(36), saved: Date.now(), ...place };
            list.unshift(p); list = list.slice(0, MAX);
            if (write(list)) return p;
            // storage full: try again without the picture
            delete p.thumb; list[0] = p;
            return write(list) ? p : null;
        },
        rename(id, name) { const list = read(); const p = list.find(p => p.id === id); if (p) { p.name = name; write(list); } return p; },
        remove(id) { write(read().filter(p => p.id !== id)); },
        url: p => `view.html?lat=${(+p.lat).toFixed(5)}&lon=${(+p.lon).toFixed(5)}&size=${p.size}&name=${encodeURIComponent(p.name)}`,
    };
})();
