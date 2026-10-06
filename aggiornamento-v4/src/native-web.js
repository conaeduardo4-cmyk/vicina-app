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

export const webNative = {
  isNative: false, platform: 'web',
  async openMaps(lat, lng, name, nav) { window.open(mapsLinks(lat, lng, name, nav, 'web').web, '_blank', 'noopener'); },
  async openUrl(url) { window.open(url, '_blank', 'noopener'); },
  update: {
    autoInstall: false,
    async current() { return null; },
    async latest(url) { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); },
    async canInstall() { return false; },
    async openInstallSettings() {},
    async install(url) { window.open(url, '_blank', 'noopener'); }
  },
  async getPos() {
    if (!navigator.geolocation) return null;
    for (const o of [{ enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }, { enableHighAccuracy: false, timeout: 4000, maximumAge: 600000 }]) {
      try { const p = await new Promise((ok, ko) => navigator.geolocation.getCurrentPosition(ok, ko, o)); return { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }; } catch {}
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
  startRecording,
  snap
};
