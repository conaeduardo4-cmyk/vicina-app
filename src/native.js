// Funzioni del telefono via Capacitor (iOS/Android). Nel browser ricade su native-web.js.
import { Capacitor, registerPlugin, CapacitorHttp } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { AppLauncher } from '@capacitor/app-launcher';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { webNative, smsUrl, mapsLinks, snap, cameraPermission, cameraState, micPermission, micState } from './native-web.js';

// Posizione anche a schermo spento (servizio in primo piano su Android, modalità background su iOS)
const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');
// Aggiornamenti dell'APK (plugin nativo aggiunto da scripts/patch-native.mjs, solo Android)
const ApkUpdater = registerPlugin('ApkUpdater');
// SMS automatici ai contatti senza app (plugin nativo, solo Android: iPhone non permette alle app di inviare SMS da sole)
const SosSms = registerPlugin('SosSms');

const isNative = Capacitor.isNativePlatform();
const norm = s => (s === 'prompt-with-rationale' ? 'prompt' : s || 'prompt');
let listeners = false;

export const native = !isNative ? webNative : {
  ...webNative,
  isNative: true,
  platform: Capacitor.getPlatform(),

  async getPos() {
    for (const o of [{ enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }, { enableHighAccuracy: false, timeout: 4000, maximumAge: 600000 }]) {
      try { const p = await Geolocation.getCurrentPosition(o); return { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }; } catch {}
    }
    return null;
  },

  async permState() {
    let loc = 'prompt', push = 'prompt';
    try { loc = norm((await Geolocation.checkPermissions()).location); } catch {}
    try { push = norm((await FirebaseMessaging.checkPermissions()).receive); } catch {}
    return { loc, cam: cameraState(), push, mic: micState() };
  },

  async requestPerms() {
    try { await Geolocation.requestPermissions({ permissions: ['location'] }); } catch (e) { console.warn('geo', e); }
    await cameraPermission();
    await micPermission();
    try { await FirebaseMessaging.requestPermissions(); } catch (e) { console.warn('push perm', e); }
  },

  // Registra il dispositivo per le notifiche push (FCM). Richiede google-services.json / GoogleService-Info.plist.
  async pushInit({ onToken, onTap }) {
    const r = norm((await FirebaseMessaging.checkPermissions()).receive);
    if (r !== 'granted') return;
    if (Capacitor.getPlatform() === 'android') {
      await FirebaseMessaging.createChannel({ id: 'sos', name: 'SOS', description: 'Allarmi SOS della tua cerchia', importance: 5, visibility: 1, vibration: true, lights: true, lightColor: '#FF3B4E' }).catch(() => {});
      await FirebaseMessaging.createChannel({ id: 'messages', name: 'Messaggi', description: 'Messaggi e richieste', importance: 3 }).catch(() => {});
    }
    const { token } = await FirebaseMessaging.getToken();
    if (token) onToken(token);
    if (!listeners) {
      listeners = true;
      FirebaseMessaging.addListener('tokenReceived', e => e?.token && onToken(e.token));
      FirebaseMessaging.addListener('notificationActionPerformed', e => onTap(e?.notification?.data || null));
    }
  },

  async share({ title, text }) {
    try { await Share.share({ title, text, dialogTitle: title }); } catch (e) { if (!/cancel/i.test(e?.message || '')) await webNative.copy(text); }
  },

  haptic(kind = 'light') {
    const style = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy }[kind] || ImpactStyle.Light;
    Haptics.impact({ style }).catch(() => {});
  },
  vibrate(p) {
    const ms = Array.isArray(p) ? p.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) : p;
    Haptics.vibrate({ duration: Math.min(ms || 300, 1500) }).catch(() => {});
  },

  // Posizione live per l'SOS: prima il plugin in background, se non c'è la posizione normale (solo app aperta)
  async watchLive(cb, o = {}) {
    try {
      const id = await BackgroundGeolocation.addWatcher({
        backgroundTitle: o.title || 'SOS attivo · posizione live',
        backgroundMessage: o.message || 'Vicina sta condividendo la tua posizione con la tua cerchia.',
        requestPermissions: true, stale: false, distanceFilter: 10
      }, (loc, err) => { if (loc && !err) cb({ lat: loc.latitude, lng: loc.longitude, acc: loc.accuracy }); });
      return () => BackgroundGeolocation.removeWatcher({ id }).catch(() => {});
    } catch (e) {
      console.warn('posizione in background non disponibile', e);
      const id = await Geolocation.watchPosition({ enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }, p => p && cb({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }));
      return () => Geolocation.clearWatch({ id }).catch(() => {});
    }
  },

  // Indicazioni / posizione: Apple Mappe su iOS, Google Maps su Android (se manca l'app, si apre il sito)
  async openMaps(lat, lng, name, nav) {
    const l = mapsLinks(lat, lng, name, nav, Capacitor.getPlatform());
    try { const r = await AppLauncher.openUrl({ url: l.app }); if (r && r.completed === false) throw new Error('non aperto'); }
    catch { try { await AppLauncher.openUrl({ url: l.web }); } catch { window.open(l.web, '_system'); } }
  },

  // Apre un link fuori dall'app (pagina di download, ecc.)
  async openUrl(url) { try { await AppLauncher.openUrl({ url }); } catch { window.open(url, '_system'); } },

  // Aggiornamenti: su Android scarica e installa l'APK dentro l'app; su iOS solo avviso + istruzioni
  update: {
    autoInstall: Capacitor.getPlatform() === 'android',
    async current() {
      if (Capacitor.getPlatform() !== 'android') return null;
      try { const i = await ApkUpdater.info(); return { version: i.versionName, code: Number(i.versionCode) || 0, canInstall: i.canInstall !== false }; }
      catch { return null; }
    },
    async latest(url) {   // richiesta nativa: niente problemi di CORS con GitHub
      const r = await CapacitorHttp.get({ url: url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), connectTimeout: 12000, readTimeout: 12000, headers: { Accept: 'application/json' } });
      if (r.status !== 200) throw new Error('HTTP ' + r.status);
      return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    },
    async canInstall() { try { return (await ApkUpdater.info()).canInstall !== false; } catch { return true; } },
    openInstallSettings: () => ApkUpdater.openInstallSettings(),
    // iPhone: scarica l'IPA nella cartella Documenti dell'app (visibile in File › Sul mio iPhone › Vicina)
    async saveIpa(url, name, onProgress) {
      const path = 'Aggiornamenti/' + name.replace(/[^\w.-]/g, '_');
      let h = null;
      try { h = await Filesystem.addListener('progress', e => { if (e?.contentLength) onProgress?.(e.bytes * 100 / e.contentLength); }); } catch {}
      try {
        try { await Filesystem.deleteFile({ path, directory: Directory.Documents }); } catch {}
        await Filesystem.downloadFile({ url, path, directory: Directory.Documents, recursive: true, progress: true });
        const { uri } = await Filesystem.getUri({ path, directory: Directory.Documents });
        onProgress?.(100);
        return { uri, path };
      } finally { try { h?.remove(); } catch {} }
    },
    // foglio di condivisione di iOS: «Salva su File», SideStore, AltStore…
    async shareFile(uri, title) { await Share.share({ title, files: [uri], dialogTitle: title }); },
    async install(url, onProgress) {
      const h = await ApkUpdater.addListener('progress', e => onProgress?.(e.percent));
      try { await ApkUpdater.downloadAndInstall({ url }); } finally { h.remove(); }
    }
  },

  // SMS: su Android partono da soli (permesso «SMS» concesso una volta); su iPhone si apre Messaggi già compilato e basta premere Invia.
  sms: {
    auto: Capacitor.getPlatform() === 'android',
    async state() { if (Capacitor.getPlatform() !== 'android') return 'unavailable'; try { return (await SosSms.check()).sms || 'prompt'; } catch { return 'unavailable'; } },
    async request() { if (Capacitor.getPlatform() !== 'android') return 'unavailable'; try { return (await SosSms.request()).sms || 'denied'; } catch { return 'unavailable'; } },
    async send(numbers, text) { return SosSms.send({ numbers, text }); }
  },
  async composeSms(nums, body) {
    const url = smsUrl(nums, body, Capacitor.getPlatform() === 'ios');
    try { await AppLauncher.openUrl({ url }); } catch { window.open(url, '_system'); }
  },
  // Condivide le foto vere (Messaggi, WhatsApp…) passando dal foglio di condivisione
  async shareImages(imgs, text) {
    try {
      const files = [];
      for (const [i, d] of imgs.entries()) {
        const path = `sos-foto-${i + 1}.jpg`;
        await Filesystem.writeFile({ path, data: d.split(',')[1], directory: Directory.Cache });
        files.push((await Filesystem.getUri({ path, directory: Directory.Cache })).uri);
      }
      await Share.share({ text, files, dialogTitle: 'Invia le foto dell\'SOS' });
      return true;
    } catch (e) { console.warn('share foto', e); return /cancel/i.test(e?.message || ''); }
  },

  // Nasconde lo splash nativo appena parte l'intro animata (passaggio senza stacchi)
  hideSplash() { SplashScreen.hide({ fadeOutDuration: 120 }).catch(() => {}); },

  // Tasto "indietro" di Android: se l'app non lo gestisce, la manda in background (non la chiude).
  onBack(cb) { App.addListener('backButton', () => { if (!cb()) App.minimizeApp(); }); },
  snap
};
