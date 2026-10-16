// Mappa vera dentro l'app: MapLibre GL + mappe gratuite OpenFreeMap (dati OpenStreetMap).
// Nessuna chiave, nessun costo, nessun limite di utilizzo. Funziona uguale su iPhone, Android e browser.
// Mostra: la mia posizione (punto blu), chi ha chiesto aiuto (pin rosso pulsante) e il percorso fatto.
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const STYLES = ['https://tiles.openfreemap.org/styles/dark', 'https://tiles.openfreemap.org/styles/liberty'];

async function pickStyle() {
  for (const url of STYLES) {
    try { const r = await fetch(url, { cache: 'force-cache' }); if (r.ok) return await r.json(); } catch { /* prova il prossimo */ }
  }
  return null;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function createMap(el, { onPick, interactive = true, center = null } = {}) {
  const style = await pickStyle();
  if (!style) throw Object.assign(new Error('Mappa non raggiungibile: controlla la connessione.'), { code: 'offline' });
  const map = new maplibregl.Map({
    container: el, style, center: center ? [center.lng, center.lat] : [12.5, 42.5], zoom: center ? 13.5 : 4.6,
    attributionControl: { compact: true }, pitchWithRotate: false, dragRotate: false, cooperativeGestures: false, interactive,
    // iPad e tablet: schermi grandi e densi → limitiamo la memoria grafica (evita chiusure del WebView)
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2), maxCanvasSize: [4096, 4096], fadeDuration: 0, maxTileCacheSize: 80
  });
  if (interactive) map.touchZoomRotate.disableRotation();
  const ready = new Promise(res => (map.loaded() ? res() : map.once('load', res)));
  // se il riquadro cambia misura (o compare dopo essere stato nascosto) la mappa si ridisegna da sola
  let ro = null;
  try { ro = new ResizeObserver(() => { if (el.clientWidth && el.clientHeight) map.resize(); }); ro.observe(el); } catch { /* browser vecchio */ }
  await ready;
  map.resize();

  map.addSource('tracks', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'tracks-glow', type: 'line', source: 'tracks', paint: { 'line-color': '#FF3B4E', 'line-width': 9, 'line-opacity': 0.18 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  map.addLayer({ id: 'tracks', type: 'line', source: 'tracks', paint: { 'line-color': '#FF3B4E', 'line-width': 3.5, 'line-dasharray': [2, 1.2] }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  map.addSource('acc', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'acc', type: 'fill', source: 'acc', paint: { 'fill-color': '#FF3B4E', 'fill-opacity': 0.12 } }, 'tracks-glow');

  // luoghi sicuri (polizia, pronto soccorso, farmacie, defibrillatori…): punti colorati, al tocco nome e indicazioni
  map.addSource('safe', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  const SAFE_COL = ['match', ['get', 'cat'], 'police', '#4DA3FF', 'hospital', '#FF4D5E', 'pharmacy', '#2FD27A', 'defib', '#FFB547', '#9C8CFF'];
  map.addLayer({ id: 'safe-halo', type: 'circle', source: 'safe', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 7, 16, 14], 'circle-color': SAFE_COL, 'circle-opacity': 0.22 } });
  map.addLayer({ id: 'safe-pts', type: 'circle', source: 'safe', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3.5, 16, 7.5], 'circle-color': SAFE_COL, 'circle-stroke-color': '#fff', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 16, 2] } });
  let safeById = new Map(), popup = null, onSafe = null;
  const SAFE_T = { police: 'Polizia / Carabinieri', hospital: 'Pronto soccorso', pharmacy: 'Farmacia', defib: 'Defibrillatore', open: 'Aperto 24 ore' };
  const openSafe = (f, at) => {
    const x = safeById.get(f.properties.id); if (!x) return;
    popup?.remove();
    const html = `<div class="sp-pop"><span class="sp-k ${x.cat}">${esc(SAFE_T[x.cat] || 'Luogo sicuro')}</span><b>${esc(x.name)}</b>
      <span class="sp-s">${[x.dist, x.addr, x.h24 ? 'aperto 24 ore' : ''].filter(Boolean).map(esc).join(' · ')}</span>
      <div class="sp-acts"><button class="btn red sm" data-a="x-url" data-u="${esc(x.dir)}">Indicazioni</button>${x.tel ? `<a class="btn ghost sm" href="tel:${esc(x.tel.replace(/[^\d+]/g, ''))}">Chiama</a>` : ''}</div></div>`;
    popup = new maplibregl.Popup({ closeButton: true, maxWidth: '260px', className: 'sp-popup', offset: 12 }).setLngLat(at || [x.lng, x.lat]).setHTML(html).addTo(map);
    onSafe?.(x);
  };
  map.on('click', 'safe-pts', e => { const f = e.features?.[0]; if (f) openSafe(f, f.geometry.coordinates); });
  map.on('click', 'safe-halo', e => { const f = e.features?.[0]; if (f && !map.queryRenderedFeatures(e.point, { layers: ['safe-pts'] }).length) openSafe(f, f.geometry.coordinates); });
  map.on('mouseenter', 'safe-pts', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'safe-pts', () => { map.getCanvas().style.cursor = ''; });
  function setSafe(items = [], cb) {
    onSafe = cb || onSafe;
    safeById = new Map(items.map(x => [String(x.id), x]));
    map.getSource('safe').setData({ type: 'FeatureCollection', features: items.map(x => ({ type: 'Feature', properties: { id: String(x.id), cat: x.cat }, geometry: { type: 'Point', coordinates: [x.lng, x.lat] } })) });
    if (!items.length) { popup?.remove(); popup = null; }
  }

  const markers = new Map();
  let meMarker = null, fitted = false, focusId = null;

  const circle = (lat, lng, m) => {   // cerchio di precisione (in metri)
    const pts = [], R = 6378137, d = Math.min(m, 2000) / R;
    for (let i = 0; i <= 40; i++) {
      const b = (i / 40) * 2 * Math.PI, la = lat * Math.PI / 180, lo = lng * Math.PI / 180;
      const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
      const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
      pts.push([lo2 * 180 / Math.PI, la2 * 180 / Math.PI]);
    }
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] }, properties: {} };
  };

  function setData({ me, people }) {
    // percorsi e precisione
    map.getSource('tracks').setData({ type: 'FeatureCollection', features: people.filter(p => (p.track || []).length > 1).map(p => ({ type: 'Feature', properties: { id: p.id }, geometry: { type: 'LineString', coordinates: p.track.map(t => [t.lng, t.lat]) } })) });
    map.getSource('acc').setData({ type: 'FeatureCollection', features: people.filter(p => p.acc && p.acc > 25).map(p => circle(p.lat, p.lng, p.acc)) });
    // pin delle persone
    const seen = new Set();
    for (const p of people) {
      seen.add(p.id);
      let m = markers.get(p.id);
      if (!m) {
        const e = document.createElement('button');
        e.className = 'pin-sos' + (p.mine ? ' mine' : '');
        e.setAttribute('aria-label', 'Posizione di ' + p.name);
        e.addEventListener('click', ev => { ev.stopPropagation(); onPick?.(p.id); });
        m = new maplibregl.Marker({ element: e, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(map);
        markers.set(p.id, m);
      }
      m.getElement().innerHTML = `<span class="pin-ring"></span><span class="pin-head">${esc(p.ini)}${p.img ? `<img src="${esc(p.img)}" alt="" onerror="this.remove()">` : ''}</span><span class="pin-tail"></span>${p.label ? `<span class="pin-label">${esc(p.label)}</span>` : ''}`;
      m.getElement().classList.toggle('stale', !!p.stale);
      m.setLngLat([p.lng, p.lat]);
    }
    for (const [id, m] of markers) if (!seen.has(id)) { m.remove(); markers.delete(id); }
    // io
    if (me) {
      if (!meMarker) { const e = document.createElement('div'); e.className = 'pin-me'; e.setAttribute('aria-label', 'La tua posizione'); meMarker = new maplibregl.Marker({ element: e }).setLngLat([me.lng, me.lat]).addTo(map); }
      else meMarker.setLngLat([me.lng, me.lat]);
    }
    // inquadratura: la prima volta (o se segui una persona) mostra tutti
    if (focusId && markers.has(focusId)) { const p = people.find(x => x.id === focusId); if (p) map.easeTo({ center: [p.lng, p.lat], duration: 600 }); }
    else if (!fitted) fitAll(people, me);
  }

  function fitAll(people, me) {
    const pts = [...people.map(p => [p.lng, p.lat]), ...people.flatMap(p => (p.track || []).map(t => [t.lng, t.lat])), ...(me ? [[me.lng, me.lat]] : [])];
    if (!pts.length) return;
    fitted = true;
    if (pts.length === 1) return map.jumpTo({ center: pts[0], zoom: interactive ? 15.5 : 14.5 });
    const b = pts.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
    map.fitBounds(b, { padding: { top: 90, bottom: 40, left: 50, right: 50 }, maxZoom: 16, duration: 0 });
  }

  return {
    setData, setSafe,
    zoomTo(lat, lng, z = 15) { map.flyTo({ center: [lng, lat], zoom: z, duration: 700 }); },
    focus(id, lat, lng) { focusId = id; fitted = true; map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15.5), duration: 800 }); },
    showAll(people, me) { focusId = null; fitted = false; fitAll(people, me); },
    center(lat, lng) { focusId = null; map.flyTo({ center: [lng, lat], zoom: 15.5, duration: 700 }); },
    resize() { map.resize(); },
    destroy() { try { ro?.disconnect(); } catch {} map.remove(); }
  };
}
