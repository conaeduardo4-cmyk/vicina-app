package __PACKAGE__;

// Aggiornamento automatico di Vicina su Android (APK fuori dal Play Store).
// Scarica il nuovo APK dentro l'app e apre l'installer di Android: l'utente conferma con un tocco su "Aggiorna".
// L'aggiornamento si installa sopra l'app esistente solo se è firmato con la STESSA chiave (vedi README).
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {
    private volatile boolean busy = false;

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls();
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject r = new JSObject();
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
            r.put("versionName", pi.versionName);
            r.put("versionCode", code);
        } catch (Exception e) {
            r.put("versionName", "");
            r.put("versionCode", 0);
        }
        r.put("canInstall", canInstall());
        call.resolve(r);
    }

    // Apre la schermata "Installa app sconosciute" per Vicina (serve una sola volta)
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Intent i = Build.VERSION.SDK_INT >= 26
                ? new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()))
                : new Intent(Settings.ACTION_SECURITY_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Impostazioni non disponibili: " + e.getMessage());
        }
    }

    @PluginMethod
    public void downloadAndInstall(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) { call.reject("Indirizzo dell'aggiornamento non valido"); return; }
        if (busy) { call.reject("Download già in corso"); return; }
        busy = true;
        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection c = null;
                try {
                    File dir = new File(getContext().getCacheDir(), "updates");
                    if (!dir.exists() && !dir.mkdirs()) throw new Exception("Spazio non disponibile");
                    File f = new File(dir, "vicina-update.apk");
                    if (f.exists()) f.delete();

                    // segue i reindirizzamenti (GitHub → server dei file)
                    String u = url;
                    for (int i = 0; ; i++) {
                        if (i > 6) throw new Exception("Troppi reindirizzamenti");
                        c = (HttpURLConnection) new URL(u).openConnection();
                        c.setInstanceFollowRedirects(false);
                        c.setConnectTimeout(15000);
                        c.setReadTimeout(30000);
                        int s = c.getResponseCode();
                        if (s >= 300 && s < 400) {
                            String loc = c.getHeaderField("Location");
                            c.disconnect();
                            if (loc == null) throw new Exception("Reindirizzamento senza destinazione");
                            u = new URL(new URL(u), loc).toString();
                            continue;
                        }
                        if (s != 200) throw new Exception("Download non riuscito (HTTP " + s + ")");
                        break;
                    }

                    int total = c.getContentLength();
                    long done = 0;
                    int last = -1;
                    InputStream in = c.getInputStream();
                    OutputStream out = new FileOutputStream(f);
                    try {
                        byte[] buf = new byte[65536];
                        int n;
                        while ((n = in.read(buf)) != -1) {
                            out.write(buf, 0, n);
                            done += n;
                            if (total > 0) {
                                int p = (int) (done * 100 / total);
                                if (p != last) {
                                    last = p;
                                    JSObject ev = new JSObject();
                                    ev.put("percent", p);
                                    notifyListeners("progress", ev);
                                }
                            }
                        }
                    } finally {
                        out.close();
                        in.close();
                    }
                    if (done < 100000) throw new Exception("File scaricato non valido");

                    Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
                    Intent install = new Intent(Intent.ACTION_VIEW);
                    install.setDataAndType(uri, "application/vnd.android.package-archive");
                    install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(install);
                    call.resolve();
                } catch (Exception e) {
                    call.reject(e.getMessage() != null ? e.getMessage() : "Aggiornamento non riuscito");
                } finally {
                    if (c != null) c.disconnect();
                    busy = false;
                }
            }
        }).start();
    }
}
