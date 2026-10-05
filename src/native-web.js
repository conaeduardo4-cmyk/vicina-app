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

export const webNative = {
  isNative: false, platform: 'web',
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
    return { loc, cam: cameraState(), push };
  },
  async requestPerms() {
    await this.getPos();
    await cameraPermission();
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
  snap
};
