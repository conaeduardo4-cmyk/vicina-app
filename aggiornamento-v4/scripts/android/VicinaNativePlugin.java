package __PACKAGE__;

// Integrazioni di Vicina con il telefono (Android):
// icona alternativa (modalità anonima), torcia vera, batteria, voce che legge un testo,
// impostazioni dell'app, scorciatoie sull'icona e widget nella schermata Home.
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.drawable.Icon;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.json.JSONObject;

@CapacitorPlugin(name = "VicinaNative")
public class VicinaNativePlugin extends Plugin {
    private TextToSpeech tts = null;
    private boolean ttsReady = false;

    private ComponentName alias(String name) {
        String pkg = getContext().getPackageName();
        return new ComponentName(pkg, pkg + "." + name);
    }

    /* ---------- icona (modalità anonima) ---------- */
    @PluginMethod
    public void getIcon(PluginCall call) {
        JSObject r = new JSObject();
        try {
            int s = getContext().getPackageManager().getComponentEnabledSetting(alias("IconBlue"));
            r.put("name", s == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ? "blue" : "default");
            r.put("supported", true);
        } catch (Exception e) {
            r.put("name", "default");
            r.put("supported", false);
        }
        call.resolve(r);
    }

    @PluginMethod
    public void setIcon(PluginCall call) {
        boolean blue = "blue".equals(call.getString("name", "default"));
        try {
            PackageManager pm = getContext().getPackageManager();
            pm.setComponentEnabledSetting(alias(blue ? "IconBlue" : "IconDefault"), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            pm.setComponentEnabledSetting(alias(blue ? "IconDefault" : "IconBlue"), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            call.resolve();
        } catch (Exception e) {
            call.reject("Icona non cambiata: " + e.getMessage());
        }
    }

    /* ---------- torcia (LED del flash) ---------- */
    @PluginMethod
    public void torch(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        try {
            CameraManager cm = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            for (String id : cm.getCameraIdList()) {
                Boolean flash = cm.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (Boolean.TRUE.equals(flash)) {
                    cm.setTorchMode(id, on);
                    call.resolve();
                    return;
                }
            }
            call.reject("Questo telefono non ha la torcia");
        } catch (Exception e) {
            call.reject("Torcia non disponibile: " + e.getMessage());
        }
    }

    /* ---------- batteria ---------- */
    @PluginMethod
    public void battery(PluginCall call) {
        JSObject r = new JSObject();
        try {
            BatteryManager bm = (BatteryManager) getContext().getSystemService(Context.BATTERY_SERVICE);
            r.put("level", bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY));
            r.put("charging", bm.isCharging());
        } catch (Exception e) {
            r.put("level", -1);
            r.put("charging", false);
        }
        call.resolve(r);
    }

    /* ---------- voce: legge un testo ad alta voce ---------- */
    @PluginMethod
    public void speak(PluginCall call) {
        final String text = call.getString("text", "");
        final String lang = call.getString("lang", "it-IT");
        if (text == null || text.isEmpty()) { call.resolve(); return; }
        if (tts != null && ttsReady) { say(text, lang); call.resolve(); return; }
        tts = new TextToSpeech(getContext(), status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            if (ttsReady) { say(text, lang); call.resolve(); }
            else call.reject("Sintesi vocale non disponibile");
        });
    }

    private void say(String text, String lang) {
        try { tts.setLanguage(Locale.forLanguageTag(lang)); } catch (Exception ignored) { }
        tts.setSpeechRate(0.95f);
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "vicina");
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        try { if (tts != null) tts.stop(); } catch (Exception ignored) { }
        call.resolve();
    }

    /* ---------- impostazioni dell'app (permessi) ---------- */
    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Impostazioni non disponibili");
        }
    }

    /* ---------- scorciatoie sull'icona (tieni premuta l'icona di Vicina) ---------- */
    @PluginMethod
    public void setShortcuts(PluginCall call) {
        if (Build.VERSION.SDK_INT < 25) { call.resolve(); return; }
        try {
            ShortcutManager sm = getContext().getSystemService(ShortcutManager.class);
            JSArray items = call.getArray("items");
            List<ShortcutInfo> list = new ArrayList<>();
            int icon = getContext().getApplicationInfo().icon;
            for (int i = 0; items != null && i < items.length() && i < 4; i++) {
                JSONObject o = items.getJSONObject(i);
                Intent in = new Intent(Intent.ACTION_VIEW, Uri.parse(o.getString("url")));
                in.setPackage(getContext().getPackageName());
                list.add(new ShortcutInfo.Builder(getContext(), o.getString("id"))
                    .setShortLabel(o.getString("title"))
                    .setLongLabel(o.optString("long", o.getString("title")))
                    .setIcon(Icon.createWithResource(getContext(), icon))
                    .setIntent(in)
                    .build());
            }
            sm.removeAllDynamicShortcuts();
            sm.setDynamicShortcuts(list);
            call.resolve();
        } catch (Exception e) {
            call.reject("Scorciatoie non impostate: " + e.getMessage());
        }
    }

    /* ---------- widget: testo e colore (normale / anonimo) ---------- */
    @PluginMethod
    public void updateWidget(PluginCall call) {
        boolean discreet = Boolean.TRUE.equals(call.getBoolean("discreet", false));
        SharedPreferences p = getContext().getSharedPreferences(VicinaWidget.PREFS, Context.MODE_PRIVATE);
        p.edit().putBoolean("discreet", discreet).apply();
        try {
            AppWidgetManager wm = AppWidgetManager.getInstance(getContext());
            int[] ids = wm.getAppWidgetIds(new ComponentName(getContext(), VicinaWidget.class));
            VicinaWidget.updateAll(getContext(), wm, ids);
            VicinaActionWidget.refreshAll(getContext());
        } catch (Exception ignored) { }
        call.resolve();
    }

    /* ---------- link vicina:// arrivato prima che l'app fosse pronta (non serve su Android) ---------- */
    @PluginMethod
    public void pendingUrl(PluginCall call) {
        call.resolve(new JSObject());
    }

    @Override
    protected void handleOnDestroy() {
        try { if (tts != null) tts.shutdown(); } catch (Exception ignored) { }
        super.handleOnDestroy();
    }
}
