// Prepara i progetti nativi dopo "npx cap add android / ios":
// permessi, notifiche push (Firebase), tema scuro. Si può rilanciare senza danni (idempotente).
import fs from 'fs';
import { execSync } from 'child_process';

const read = p => fs.readFileSync(p, 'utf8');
const copyDir = (from, to) => { for (const e of fs.readdirSync(from, { withFileTypes: true })) { const a = from + '/' + e.name, b = to + '/' + e.name; if (e.isDirectory()) { fs.mkdirSync(b, { recursive: true }); copyDir(a, b); } else fs.copyFileSync(a, b); } };
const log = m => console.log('  ✓ ' + m);

/* ---------------- Android ---------------- */
const man = 'android/app/src/main/AndroidManifest.xml';
if (fs.existsSync(man)) {
  console.log('Android');
  let s = read(man);
  for (const p of ['CAMERA', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'POST_NOTIFICATIONS', 'VIBRATE', 'RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION', 'WAKE_LOCK', 'REQUEST_INSTALL_PACKAGES', 'SEND_SMS'])
    if (!s.includes(`android.permission.${p}"`)) s = s.replace('</manifest>', `    <uses-permission android:name="android.permission.${p}" />\n</manifest>`);
  for (const f of ['android.hardware.camera', 'android.hardware.location.gps', 'android.hardware.telephony'])
    if (!s.includes(`"${f}"`)) s = s.replace('</manifest>', `    <uses-feature android:name="${f}" android:required="false" />\n</manifest>`);
  if (!s.includes('default_notification_channel_id'))
    s = s.replace(/(<application[^>]*>)/, `$1\n        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="messages" />`);
  fs.writeFileSync(man, s); log('permessi e canale notifiche');

  // Aggiornamenti automatici: plugin nativo che scarica il nuovo APK e apre l'installer
  const findMain = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = dir + '/' + e.name;
      if (e.isDirectory()) { const r = findMain(f); if (r) return r; }
      else if (e.name === 'MainActivity.java') return f;
    }
    return null;
  };
  const mainAct = fs.existsSync('android/app/src/main/java') ? findMain('android/app/src/main/java') : null;
  if (mainAct) {
    let m = read(mainAct);
    const pkg = (m.match(/^package\s+([\w.]+);/m) || [])[1];
    const dir = mainAct.slice(0, mainAct.lastIndexOf('/'));
    fs.writeFileSync(dir + '/ApkUpdaterPlugin.java', read('scripts/android/ApkUpdaterPlugin.java').replace('__PACKAGE__', pkg));
    if (!m.includes('ApkUpdaterPlugin')) {
      if (/onCreate\s*\(/.test(m)) m = m.replace(/(onCreate\s*\([^)]*\)\s*\{)/, '$1\n        registerPlugin(ApkUpdaterPlugin.class);');
      else {
        if (!m.includes('import android.os.Bundle;')) m = m.replace(/(package[^;]+;)/, '$1\n\nimport android.os.Bundle;');
        m = m.replace(/extends BridgeActivity\s*\{\s*\}/, `extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}`);
      }
      fs.writeFileSync(mainAct, m);
    }
    log(m.includes('ApkUpdaterPlugin') ? 'aggiornamenti automatici (plugin ApkUpdater)' : 'ATTENZIONE: plugin aggiornamenti non registrato in MainActivity');
    // SMS automatici ai contatti senza app
    fs.writeFileSync(dir + '/SosSmsPlugin.java', read('scripts/android/SosSmsPlugin.java').replace('__PACKAGE__', pkg));
    if (!m.includes('SosSmsPlugin') && m.includes('registerPlugin(ApkUpdaterPlugin.class);')) {
      m = m.replace('registerPlugin(ApkUpdaterPlugin.class);', 'registerPlugin(ApkUpdaterPlugin.class);\n        registerPlugin(SosSmsPlugin.class);');
      fs.writeFileSync(mainAct, m);
    }
    log(m.includes('SosSmsPlugin') ? 'SMS automatici ai contatti senza app (plugin SosSms)' : 'ATTENZIONE: plugin SMS non registrato in MainActivity');
    // integrazioni (icona anonima, torcia, batteria, voce, scorciatoie, widget)
    for (const f of ['VicinaNativePlugin', 'VicinaWidget', 'VicinaCallWidget']) fs.writeFileSync(dir + '/' + f + '.java', read('scripts/android/' + f + '.java').replace('__PACKAGE__', pkg));
    if (!m.includes('VicinaNativePlugin') && m.includes('registerPlugin(ApkUpdaterPlugin.class);')) {
      m = m.replace('registerPlugin(ApkUpdaterPlugin.class);', 'registerPlugin(ApkUpdaterPlugin.class);\n        registerPlugin(VicinaNativePlugin.class);');
      fs.writeFileSync(mainAct, m);
    }
    log(m.includes('VicinaNativePlugin') ? 'integrazioni Vicina (plugin VicinaNative + widget)' : 'ATTENZIONE: plugin VicinaNative non registrato');
  }
  // risorse: icona celeste (modalità anonima) e widget
  copyDir('scripts/android/res', 'android/app/src/main/res');
  {
    let x = read(man);
    // icona alternativa: l'app si apre da due "alias" (normale / celeste), ne è attivo uno alla volta
    if (!x.includes('.IconDefault')) {
      const launcher = /\s*<intent-filter>\s*<action android:name="android\.intent\.action\.MAIN"\s*\/>\s*<category android:name="android\.intent\.category\.LAUNCHER"\s*\/>\s*<\/intent-filter>/;
      if (launcher.test(x)) {
        x = x.replace(launcher, '');
        const alias = (name, icon, on) => `
        <activity-alias android:name=".${name}" android:enabled="${on}" android:exported="true" android:icon="@mipmap/${icon}" android:roundIcon="@mipmap/${icon}_round" android:label="@string/app_name" android:targetActivity=".MainActivity">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity-alias>`;
        x = x.replace(/(<activity[\s\S]*?android:name="\.MainActivity"[\s\S]*?<\/activity>)/, `$1${alias('IconDefault', 'ic_launcher', true)}${alias('IconBlue', 'ic_launcher_blue', false)}`);
      }
    }
    // link vicina://sos (scorciatoie, widget, Comandi)
    if (!x.includes('android:scheme="vicina"'))
      x = x.replace(/(<activity[\s\S]*?android:name="\.MainActivity"[^>]*>)/, `$1
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="vicina" />
            </intent-filter>`);
    // widget nella schermata Home
    if (!x.includes('.VicinaCallWidget'))
      x = x.replace('</application>', `    <receiver android:name=".VicinaCallWidget" android:exported="false" android:label="Chiama 112">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/vicina_call_widget_info" />
        </receiver>
    </application>`);
    if (!x.includes('.VicinaWidget"'))
      x = x.replace('</application>', `    <receiver android:name=".VicinaWidget" android:exported="false" android:label="SOS">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/vicina_widget_info" />
        </receiver>
    </application>`);
    fs.writeFileSync(man, x);
    log(x.includes('.IconBlue') ? 'icona anonima, link vicina:// e widget' : 'ATTENZIONE: icona anonima non configurata (MainActivity senza LAUNCHER?)');
  }

  const fp = 'android/app/src/main/res/xml/file_paths.xml';
  if (fs.existsSync(fp)) {
    let x = read(fp);
    if (!/<cache-path[^>]*path="\."/.test(x) && !x.includes('name="updates"')) x = x.replace('</paths>', '    <cache-path name="updates" path="updates/" />\n</paths>');
    fs.writeFileSync(fp, x);
  } else {
    fs.mkdirSync('android/app/src/main/res/xml', { recursive: true });
    fs.writeFileSync(fp, '<?xml version="1.0" encoding="utf-8"?>\n<paths xmlns:android="http://schemas.android.com/apk/res/android">\n    <cache-path name="updates" path="updates/" />\n</paths>\n');
  }

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
    NSLocationAlwaysAndWhenInUseUsageDescription: '<string>Durante un SOS Vicina aggiorna la tua posizione, anche a schermo spento, finché non tocchi «Sono al sicuro», così la tua cerchia può raggiungerti.</string>',
    UIBackgroundModes: '<array>\n\t\t<string>remote-notification</string>\n\t\t<string>location</string>\n\t</array>',
    ITSAppUsesNonExemptEncryption: '<false/>',
    UIFileSharingEnabled: '<true/>',                  // la cartella di Vicina compare nell'app File (aggiornamenti .ipa)
    LSSupportsOpeningDocumentsInPlace: '<true/>',
    UIUserInterfaceStyle: '<string>Dark</string>'
  };
  for (const [k, v] of Object.entries(add))
    if (!s.includes(`<key>${k}</key>`)) s = s.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${k}</key>\n\t${v}\n</dict>\n</plist>\n`);
  // se UIBackgroundModes esisteva già senza "location", lo aggiunge
  s = s.replace(/(<key>UIBackgroundModes<\/key>\s*<array>)([\s\S]*?)(<\/array>)/, (m, a, b, c) => b.includes('<string>location</string>') ? m : a + b + '\t<string>location</string>\n\t' + c);
  fs.writeFileSync(plist, s); log('permessi, posizione in background e microfono');

  // link vicina:// (azioni rapide, Comandi, «Tocca il retro»)
  s = read(plist);
  if (!s.includes('<string>vicina</string>')) {
    const urlType = '<dict>\n\t\t\t<key>CFBundleURLName</key>\n\t\t\t<string>it.vicina.app</string>\n\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array>\n\t\t\t\t<string>vicina</string>\n\t\t\t</array>\n\t\t</dict>';
    if (s.includes('<key>CFBundleURLTypes</key>')) s = s.replace(/(<key>CFBundleURLTypes<\/key>\s*<array>)/, `$1\n\t\t${urlType}`);
    else s = s.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>CFBundleURLTypes</key>\n\t<array>\n\t\t${urlType}\n\t</array>\n</dict>\n</plist>\n`);
    fs.writeFileSync(plist, s);
  }
  log('link vicina://');

  // icona celeste + plugin nativo (Swift) aggiunto al progetto con xcodeproj
  const xc = 'ios/App/App/Assets.xcassets';
  if (fs.existsSync(xc)) { fs.mkdirSync(xc + '/AppIconBlue.appiconset', { recursive: true }); copyDir('scripts/ios/AppIconBlue.appiconset', xc + '/AppIconBlue.appiconset'); }
  fs.copyFileSync('scripts/ios/VicinaNative.swift', 'ios/App/App/VicinaNative.swift');
  try { execSync('ruby scripts/ios-native.rb', { stdio: 'inherit' }); log('integrazioni Vicina (icona anonima, torcia, voce, azioni rapide)'); }
  catch (e) { console.log('  ! integrazioni iOS non aggiunte (xcodeproj mancante?): l\'app funziona lo stesso, senza icona anonima e torcia'); }
  // widget SOS e 112 (estensione WidgetKit). Per saltarli: crea il file scripts/ios/NO_WIDGETS
  if (!fs.existsSync('scripts/ios/NO_WIDGETS')) {
    fs.mkdirSync('ios/App/VicinaWidgets', { recursive: true });
    copyDir('scripts/ios/VicinaWidgets', 'ios/App/VicinaWidgets');
    try { execSync('ruby scripts/ios-widgets.rb', { stdio: 'inherit' }); log('widget SOS e 112'); }
    catch (e) { console.log('  ! widget iOS non aggiunti: l\'app funziona lo stesso'); }
  }
  {
    const ad0 = 'ios/App/App/AppDelegate.swift';
    let a = read(ad0);
    if (!a.includes('performActionFor shortcutItem')) {
      const m2 = `
    // azioni rapide sull'icona (tieni premuta l'icona di Vicina)
    func application(_ application: UIApplication, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        UserDefaults.standard.set(shortcutItem.type, forKey: "vicina_pending_url")
        if let url = URL(string: shortcutItem.type) { _ = ApplicationDelegateProxy.shared.application(application, open: url, options: [:]) }
        completionHandler(true)
    }
`;
      const i = a.lastIndexOf('}');
      a = a.slice(0, i) + m2 + a.slice(i);
      fs.writeFileSync(ad0, a);
    }
  }

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
