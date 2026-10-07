// Funzioni "telefono" in versione browser (senza Capacitor). Usate dall'anteprima e come base per native.js.
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const wait = ms => new Promise(r => setTimeout(r, ms));

export async function snap(facing) { // foto senza anteprima: l'app deve essere in primo piano
  let s, v;
  try {
    s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 } }, audio: false });
    v = document.createElement('video'); v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.srcObject = s;
    v.style.cssText = 'position:fixed;opacity:0;width:1px;height:1px;pointer-events:none'; document.body.appendChild(v);
    await v.play(); await wait(700); // tempo per l'esposizione automatica
    const k = Math.min(1, 1024 / Math.max(v.videoWidth, v.videoHeight)), c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72);
  } catch { return null; }
  finally { s?.getTracks().forEach(t => t.stop()); v?.remove(); }
}

export async function cameraPermission() {
  try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach(t => t.stop()); ls.set('cam', 'granted'); return 'granted'; }
  catch (e) { const r = /NotAllowed|Permission/i.test(e?.name || '') ? 'denied' : 'prompt'; ls.set('cam', r); return r; }
}
export const cameraState = () => ls.get('cam') || 'prompt';


// Registrazione audio (messaggio vocale). Restituisce { stop(): Promise<{blob, ext, mime, ms}>, cancel() }
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
  const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus', 'audio/webm'];
  const mime = (window.MediaRecorder && types.find(t => MediaRecorder.isTypeSupported?.(t))) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
  const chunks = []; const t0 = Date.now();
  rec.ondataavailable = e => e.data && e.data.size && chunks.push(e.data);
  rec.start(250);
  const close = () => stream.getTracks().forEach(t => t.stop());
  return {
    stop: () => new Promise(res => {
      rec.onstop = () => {
        close();
        const type = (rec.mimeType || mime || 'audio/webm').split(';')[0];
        const ext = /mp4|aac|m4a/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm';
        res({ blob: new Blob(chunks, { type }), ext, mime: ext === 'm4a' ? 'audio/mp4' : type, ms: Date.now() - t0 });
      };
      try { rec.stop(); } catch { close(); res(null); }
    }),
    cancel: () => { try { rec.onstop = null; rec.stop(); } catch {} close(); }
  };
}
export async function micPermission() {
  try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); ls.set('mic', 'granted'); return 'granted'; }
  catch (e) { const r = /NotAllowed|Permission/i.test(e?.name || '') ? 'denied' : 'prompt'; ls.set('mic', r); return r; }
}
export const micState = () => ls.get('mic') || 'prompt';

// Apre la posizione nell'app di mappe del telefono: Apple Mappe su iPhone/iPad/Mac, Google Maps altrove.
export const mapsLinks = (lat, lng, name, nav, platform) => {
  const q = encodeURIComponent(name || 'Posizione SOS'), ll = `${lat},${lng}`;
  const apple = platform === 'ios' || (platform === 'web' && /iPhone|iPad|Macintosh/.test(navigator.userAgent));
  if (apple) return { app: nav ? `maps://?daddr=${ll}&dirflg=w` : `maps://?ll=${ll}&q=${q}`, web: nav ? `https://maps.apple.com/?daddr=${ll}&dirflg=w` : `https://maps.apple.com/?ll=${ll}&q=${q}` };
  return { app: nav ? `google.navigation:q=${ll}&mode=w` : `geo:${ll}?q=${ll}(${q})`, web: nav ? `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=walking` : `https://www.google.com/maps/search/?api=1&query=${ll}` };
};

// Link per aprire l'app Messaggi già compilata (destinatari + testo). iPhone vuole un formato diverso per più numeri.
export const smsUrl = (nums, body, apple) => apple
  ? `sms://open?addresses=${nums.join(',')}&body=${encodeURIComponent(body)}`
  : `sms:${nums.join(',')}?body=${encodeURIComponent(body)}`;
const dataUrlToFile = (d, name) => { const [h, b] = d.split(','), bin = atob(b), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new File([u], name, { type: (h.match(/:(.*?);/) || [])[1] || 'image/jpeg' }); };

let webTorch = null;

// version.json può arrivare come oggetto, come testo o (su iPhone, con GitHub) come base64: lo leggiamo in tutti i casi
export function parseJsonLoose(d) {
  if (d && typeof d === 'object') return d;
  const s = String(d ?? '').trim(); if (!s) return null;
  try { return JSON.parse(s); } catch {}
  try { const b = atob(s.replace(/\s+/g, '')); try { return JSON.parse(decodeURIComponent(escape(b))); } catch { return JSON.parse(b); } } catch {}
  return null;
}
// riserva: se version.json non si legge, ricostruiamo le informazioni dall'ultima release di GitHub
export function releaseToVersion(r) {
  if (!r || !r.tag_name) return null;
  const v = String(r.tag_name).replace(/^v/, ''), code = Number((v.match(/(\d+)$/) || [])[1] || 0);
  const a = name => (r.assets || []).find(x => name.test(x.name))?.browser_download_url || null;
  const ipa = a(/\.ipa$/i), apk = a(/^Vicina\.apk$/i);
  return { version: v, code, date: r.published_at, notes: r.body || '', page: r.html_url, release: r.html_url,
    android: { apk, sha256: null }, ios: { ipa, version: v, code: ipa ? code : 0, notes: r.body || '', page: r.html_url, release: r.html_url } };
}
export const apiUrlFor = url => { const m = String(url).match(/github\.com\/([^/]+)\/([^/]+)\/releases/); return m ? `https://api.github.com/repos/${m[1]}/${m[2]}/releases/latest` : null; };


// ---------- luoghi vicini (OpenStreetMap) ----------
// Il server principale di Overpass è spesso sovraccarico (risponde 429/504 o con un errore dentro il JSON):
// proviamo più server uno dopo l'altro e, se nessuno risponde, la ricerca di Nominatim con il nome in italiano.
export const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];
export async function osmQuery(get, q, opt = {}) {
  let last = null;
  for (const u of OVERPASS) {
    try {
      const j = parseJsonLoose(await get(u + '?data=' + encodeURIComponent(q), 'application/json'));
      if (j && Array.isArray(j.elements)) {
        if (j.elements.length) return j;
        if (!j.remark) { last = 'vuoto'; break; }            // risposta valida ma niente intorno: inutile chiedere agli altri
      }
      last = new Error(j?.remark || 'risposta non valida');
    } catch (e) { last = e; }
  }
  // ultima spiaggia: Nominatim, cercando per nome («farmacia», «carabinieri»…) dentro un riquadro intorno a te
  if (opt.term && opt.p) {
    try {
      const d = Math.min(0.2, (opt.r || 3000) / 111000), { lat, lng } = opt.p;
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=15&bounded=1&accept-language=it&viewbox=${lng - d * 1.4},${lat + d},${lng + d * 1.4},${lat - d}&q=${encodeURIComponent(opt.term)}`;
      const a = parseJsonLoose(await get(url, 'application/json'));
      if (Array.isArray(a) && a.length) return { elements: a.map(x => ({ id: x.osm_id, lat: Number(x.lat), lon: Number(x.lon), tags: { name: x.name || String(x.display_name || '').split(',')[0], [x.category]: x.type, 'addr:street': x.address?.road } })) };
    } catch (e) { last = e; }
  }
  if (last === 'vuoto') return { elements: [] };
  throw last || new Error('Luoghi non raggiungibili');
}
const webGet = async (url, accept) => {
  const c = new AbortController(), t = setTimeout(() => c.abort(), 14000);
  try { const r = await fetch(url, { headers: { Accept: accept }, signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
  finally { clearTimeout(t); }
};

export const webNative = {
  osm: (q, opt) => osmQuery(webGet, q, opt),
  isNative: false, platform: 'web',
  async openMaps(lat, lng, name, nav) { window.open(mapsLinks(lat, lng, name, nav, 'web').web, '_blank', 'noopener'); },
  async openUrl(url) { window.open(url, '_blank', 'noopener'); },
  update: {
    autoInstall: false,
    async current() { return null; },
    async latest(url) {
      try { const r = await fetch(url, { cache: 'no-store' }); if (r.ok) { const j = parseJsonLoose(await r.text()); if (j) return j; } } catch {}
      const api = apiUrlFor(url); if (!api) throw new Error('Aggiornamenti non raggiungibili');
      const r = await fetch(api, { headers: { Accept: 'application/vnd.github+json' } }); if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = releaseToVersion(await r.json()); if (!j) throw new Error('Release non valida'); return j;
    },
    async canInstall() { return false; },
    async openInstallSettings() {},
    async install(url) { window.open(url, '_blank', 'noopener'); }
  },
  async getPos() {
    if (!navigator.geolocation) return null;
    for (const o of [{ enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }, { enableHighAccuracy: false, timeout: 4000, maximumAge: 600000 }]) {
      try { const p = await new Promise((ok, ko) => navigator.geolocation.getCurrentPosition(ok, ko, o)); return { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, alt: p.coords.altitude ?? null }; } catch {}
    }
    return null;
  },
  async permState() {
    let loc = 'prompt';
    try { loc = (await navigator.permissions.query({ name: 'geolocation' })).state; } catch {}
    const push = typeof Notification !== 'undefined' ? ({ default: 'prompt' }[Notification.permission] || Notification.permission) : 'prompt';
    return { loc, cam: cameraState(), push, mic: micState() };
  },
  async requestPerms() {
    await this.getPos();
    await cameraPermission();
    await micPermission();
    try { if (typeof Notification !== 'undefined') await Notification.requestPermission(); } catch {}
  },
  async pushInit() { /* le notifiche push funzionano solo nell'app installata */ },
  async share({ title, text }) {
    if (navigator.share) { try { await navigator.share({ title, text }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
    await this.copy(text);
  },
  async copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  },
  haptic() { try { navigator.vibrate?.(15); } catch {} },
  vibrate(p) { try { navigator.vibrate?.(p); } catch {} },
  onBack() {},
  hideSplash() {},
  // Posizione live: chiama cb({lat,lng,acc}) a ogni aggiornamento. Restituisce una funzione per fermarla.
  async watchLive(cb) {
    if (!navigator.geolocation) return () => {};
    const id = navigator.geolocation.watchPosition(p => cb({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }), () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(id);
  },
  // SMS ai contatti senza app. Nel browser non si possono inviare da soli: si apre l'app Messaggi.
  sms: {
    auto: false,
    async state() { return 'unavailable'; },
    async request() { return 'unavailable'; },
    async send() { throw new Error('Invio automatico non disponibile'); }
  },
  async composeSms(nums, body) { location.href = smsUrl(nums, body, /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent)); },
  async shareImages(imgs, text) {
    const files = imgs.map((d, i) => dataUrlToFile(d, `sos-${i + 1}.jpg`));
    if (navigator.canShare?.({ files })) { try { await navigator.share({ files, text }); return true; } catch (e) { return e?.name !== 'AbortError' ? false : true; } }
    return false;
  },
  async shareBlob(blob, name, text) {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], text }); return true; } catch (e) { return e?.name === 'AbortError'; } }
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name }); document.body.appendChild(a); a.click(); a.remove(); return true;
  },
  // integrazioni con il telefono: nel browser solo quello che il browser sa fare
  vx: {
    native: false,
    async getIcon() { return { name: 'default', supported: false }; },
    async setIcon() { throw new Error('Disponibile solo nell\'app installata'); },
    async torch(on) {   // torcia: funziona su Chrome per Android
      if (!on) { webTorch?.getTracks().forEach(t => t.stop()); webTorch = null; return; }
      webTorch = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const tr = webTorch.getVideoTracks()[0];
      if (!tr.getCapabilities?.().torch) { webTorch.getTracks().forEach(t => t.stop()); webTorch = null; throw new Error('Torcia non disponibile'); }
      await tr.applyConstraints({ advanced: [{ torch: true }] });
    },
    async battery() { try { const b = await navigator.getBattery(); return { level: Math.round(b.level * 100), charging: b.charging }; } catch { return { level: -1, charging: false }; } },
    async speak(text, lang = 'it-IT') {
      if (!window.speechSynthesis) return false;
      speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = 0.95;
      const v = speechSynthesis.getVoices().find(x => x.lang?.startsWith(lang.slice(0, 2))); if (v) u.voice = v;
      speechSynthesis.speak(u); return true;
    },
    async stopSpeaking() { try { speechSynthesis.cancel(); } catch {} },
    async openSettings() {},
    async setShortcuts() {},
    async updateWidget() {},
    async channels() {},
    onUrl(cb) { const h = () => { const m = location.hash.match(/vicina=([\w\/-]+)/); if (m) { cb('vicina://' + m[1]); history.replaceState(null, '', location.pathname); } }; window.addEventListener('hashchange', h); setTimeout(h, 1500); }
  },
  startRecording,
  snap
};
