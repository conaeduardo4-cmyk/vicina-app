// Funzioni del telefono via Capacitor (iOS/Android). Nel browser ricade su native-web.js.
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { App } from '@capacitor/app';
import { webNative, snap, cameraPermission, cameraState } from './native-web.js';

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
    return { loc, cam: cameraState(), push };
  },

  async requestPerms() {
    try { await Geolocation.requestPermissions({ permissions: ['location'] }); } catch (e) { console.warn('geo', e); }
    await cameraPermission();
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

  // Tasto "indietro" di Android: se l'app non lo gestisce, la manda in background (non la chiude).
  onBack(cb) { App.addListener('backButton', () => { if (!cb()) App.minimizeApp(); }); },
  snap
};
