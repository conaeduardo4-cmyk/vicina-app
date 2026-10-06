// Prepara i progetti nativi dopo "npx cap add android / ios":
// permessi, notifiche push (Firebase), tema scuro. Si può rilanciare senza danni (idempotente).
import fs from 'fs';

const read = p => fs.readFileSync(p, 'utf8');
const log = m => console.log('  ✓ ' + m);

/* ---------------- Android ---------------- */
const man = 'android/app/src/main/AndroidManifest.xml';
if (fs.existsSync(man)) {
  console.log('Android');
  let s = read(man);
  for (const p of ['CAMERA', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'POST_NOTIFICATIONS', 'VIBRATE', 'RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION', 'WAKE_LOCK'])
    if (!s.includes(`android.permission.${p}"`)) s = s.replace('</manifest>', `    <uses-permission android:name="android.permission.${p}" />\n</manifest>`);
  for (const f of ['android.hardware.camera', 'android.hardware.location.gps'])
    if (!s.includes(`"${f}"`)) s = s.replace('</manifest>', `    <uses-feature android:name="${f}" android:required="false" />\n</manifest>`);
  if (!s.includes('default_notification_channel_id'))
    s = s.replace(/(<application[^>]*>)/, `$1\n        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="messages" />`);
  fs.writeFileSync(man, s); log('permessi e canale notifiche');

  const gs = 'android/app/google-services.json';
  log(fs.existsSync(gs) ? 'google-services.json presente (push attive)' : 'ATTENZIONE: google-services.json mancante → push disattivate');

  const styles = 'android/app/src/main/res/values/styles.xml';
  if (fs.existsSync(styles)) {
    let st = read(styles);
    if (!st.includes('android:windowBackground">#0B0B10'))
      st = st.replace(/(<style name="AppTheme.NoActionBar"[^>]*>)/, `$1\n        <item name="android:windowBackground">#0B0B10</item>`);
    fs.writeFileSync(styles, st); log('sfondo scuro');
  }
}

/* ---------------- iOS ---------------- */
const plist = 'ios/App/App/Info.plist';
if (fs.existsSync(plist)) {
  console.log('iOS');
  let s = read(plist);
  const add = {
    NSCameraUsageDescription: '<string>Vicina scatta una foto di dove ti trovi quando invii un SOS, per mostrarla alle persone che avvisi.</string>',
    NSLocationWhenInUseUsageDescription: '<string>Vicina invia la tua posizione attuale alle persone che avvisi quando premi SOS.</string>',
    NSMicrophoneUsageDescription: '<string>Vicina registra un messaggio vocale solo quando tieni premuto il microfono durante un SOS.</string>',
    NSLocationAlwaysAndWhenInUseUsageDescription: '<string>Durante un SOS Vicina aggiorna la tua posizione per 15 minuti, anche a schermo spento, così la tua cerchia può raggiungerti.</string>',
    UIBackgroundModes: '<array>\n\t\t<string>remote-notification</string>\n\t\t<string>location</string>\n\t</array>',
    ITSAppUsesNonExemptEncryption: '<false/>',
    UIUserInterfaceStyle: '<string>Dark</string>'
  };
  for (const [k, v] of Object.entries(add))
    if (!s.includes(`<key>${k}</key>`)) s = s.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${k}</key>\n\t${v}\n</dict>\n</plist>\n`);
  // se UIBackgroundModes esisteva già senza "location", lo aggiunge
  s = s.replace(/(<key>UIBackgroundModes<\/key>\s*<array>)([\s\S]*?)(<\/array>)/, (m, a, b, c) => b.includes('<string>location</string>') ? m : a + b + '\t<string>location</string>\n\t' + c);
  fs.writeFileSync(plist, s); log('permessi, posizione in background e microfono');

  const gsi = 'ios/App/App/GoogleService-Info.plist';
  const ad = 'ios/App/App/AppDelegate.swift';
  if (fs.existsSync(gsi) && fs.existsSync(ad)) {
    let a = read(ad);
    if (!a.includes('import FirebaseCore')) a = a.replace('import Capacitor', 'import Capacitor\nimport FirebaseCore');
    if (!a.includes('FirebaseApp.configure()'))
      a = a.replace(/(didFinishLaunchingWithOptions[^{]*\{)/, '$1\n        FirebaseApp.configure()');
    if (!a.includes('capacitorDidRegisterForRemoteNotifications')) {
      const methods = `
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
`;
      const i = a.lastIndexOf('}');
      a = a.slice(0, i) + methods + a.slice(i);
    }
    fs.writeFileSync(ad, a); log('Firebase configurato in AppDelegate');
  } else log('ATTENZIONE: GoogleService-Info.plist mancante → push disattivate su iOS');
}
