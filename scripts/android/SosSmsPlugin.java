package __PACKAGE__;

// SMS automatici di Vicina (solo Android): quando parte un SOS, i contatti "senza app" ricevono
// un SMS con posizione e link alle foto, senza che tu debba toccare nulla.
// Serve il permesso "SMS", chiesto una sola volta quando aggiungi il primo contatto.
import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.telephony.SmsManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;

@CapacitorPlugin(
    name = "SosSms",
    permissions = { @Permission(strings = { Manifest.permission.SEND_SMS }, alias = "sms") }
)
public class SosSmsPlugin extends Plugin {

    private boolean hasPhone() {
        return getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_TELEPHONY);
    }

    private String state() {
        if (!hasPhone()) return "unavailable";
        PermissionState s = getPermissionState("sms");
        if (s == PermissionState.GRANTED) return "granted";
        if (s == PermissionState.DENIED) return "denied";
        return "prompt";
    }

    @PluginMethod
    public void check(PluginCall call) {
        JSObject r = new JSObject();
        r.put("sms", state());
        call.resolve(r);
    }

    @PluginMethod
    public void request(PluginCall call) {
        if (!hasPhone() || getPermissionState("sms") == PermissionState.GRANTED) { check(call); return; }
        requestPermissionForAlias("sms", call, "smsPermissionDone");
    }

    @PermissionCallback
    private void smsPermissionDone(PluginCall call) {
        check(call);
    }

    @SuppressWarnings("deprecation")
    private SmsManager manager() {
        SmsManager m = null;
        if (Build.VERSION.SDK_INT >= 31) {
            try { m = getContext().getSystemService(SmsManager.class); } catch (Exception ignored) { }
        }
        return m != null ? m : SmsManager.getDefault();
    }

    @PluginMethod
    public void send(PluginCall call) {
        if (!hasPhone()) { call.reject("Questo dispositivo non può inviare SMS", "unavailable"); return; }
        if (getPermissionState("sms") != PermissionState.GRANTED) { call.reject("Permesso SMS non concesso", "denied"); return; }
        JSArray numbers = call.getArray("numbers");
        String text = call.getString("text", "");
        if (numbers == null || numbers.length() == 0 || text == null || text.isEmpty()) { call.reject("Niente da inviare"); return; }
        SmsManager sm = manager();
        ArrayList<String> parts = sm.divideMessage(text);
        int sent = 0;
        JSArray failed = new JSArray();
        for (int i = 0; i < numbers.length(); i++) {
            String n = numbers.optString(i, "");
            if (n.isEmpty()) continue;
            try {
                if (parts.size() > 1) sm.sendMultipartTextMessage(n, null, parts, null, null);
                else sm.sendTextMessage(n, null, text, null, null);
                sent++;
            } catch (Exception e) {
                failed.put(n);
            }
        }
        JSObject r = new JSObject();
        r.put("sent", sent);
        r.put("failed", failed);
        if (sent == 0) call.reject("SMS non inviati"); else call.resolve(r);
    }
}
