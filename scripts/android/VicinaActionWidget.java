package __PACKAGE__;

// Widget a tasto singolo di Vicina (Android): Panico, Sirena, Finta chiamata, Accompagnami,
// Portami a casa, Sto bene, Torcia, più il Pannello rapido con 4 tasti (SOS, 112, Sirena, Torcia).
// Un tocco apre Vicina e fa subito l'azione (link vicina://…). In modalità anonima i testi diventano neutri.
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

public class VicinaActionWidget extends AppWidgetProvider {
    // chiave, titolo, sottotitolo, titolo anonimo, link, colore, testo scuro
    static final String[][] KINDS = {
        { "panic", "Panico", "sirena + avviso", "Avviso", "vicina://panic", "darkred", "0" },
        { "siren", "Sirena", "suono fortissimo", "Suono", "vicina://siren", "amber", "1" },
        { "fake", "Finta chiamata", "ti chiamano tra poco", "Chiamata", "vicina://fake", "green", "0" },
        { "walk", "Accompagnami", "timer di sicurezza", "Percorso", "vicina://walk", "violet", "0" },
        { "home", "Portami a casa", "strada + timer", "Casa", "vicina://home", "blue", "0" },
        { "ok", "Sto bene", "lo dice alla cerchia", "Sto bene", "vicina://ok", "green", "0" },
        { "torch", "Torcia", "accendi il flash", "Torcia", "vicina://torch", "dark", "0" }
    };

    protected String kind() { return "panic"; }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        draw(context, manager, ids, kind());
    }

    static PendingIntent link(Context c, String url, int req) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        i.setPackage(c.getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static int res(Context c, String name, String type) {
        return c.getResources().getIdentifier(name, type, c.getPackageName());
    }

    static void draw(Context c, AppWidgetManager m, int[] ids, String key) {
        if (ids == null) return;
        boolean discreet = c.getSharedPreferences(VicinaWidget.PREFS, Context.MODE_PRIVATE).getBoolean("discreet", false);
        String[] k = KINDS[0];
        for (String[] x : KINDS) if (x[0].equals(key)) k = x;
        for (int id : ids) {
            RemoteViews v = new RemoteViews(c.getPackageName(), res(c, "vicina_action_widget", "layout"));
            int root = res(c, "vicina_aw_root", "id"), title = res(c, "vicina_aw_title", "id"), sub = res(c, "vicina_aw_sub", "id");
            v.setTextViewText(title, discreet ? k[3] : k[1]);
            v.setTextViewText(sub, discreet ? "tocca" : k[2]);
            int color = "1".equals(k[6]) ? 0xFF1A1200 : 0xFFFFFFFF;
            v.setTextColor(title, color);
            v.setTextColor(sub, color);
            v.setInt(root, "setBackgroundResource", res(c, "vicina_aw_" + (discreet ? "blue" : k[5]), "drawable"));
            v.setOnClickPendingIntent(root, link(c, k[4], 200 + key.hashCode() % 100));
            m.updateAppWidget(id, v);
        }
    }

    static void drawPanel(Context c, AppWidgetManager m, int[] ids) {
        if (ids == null) return;
        boolean discreet = c.getSharedPreferences(VicinaWidget.PREFS, Context.MODE_PRIVATE).getBoolean("discreet", false);
        for (int id : ids) {
            RemoteViews v = new RemoteViews(c.getPackageName(), res(c, "vicina_panel_widget", "layout"));
            v.setTextViewText(res(c, "vicina_p1", "id"), discreet ? "Segnale" : "SOS");
            v.setTextViewText(res(c, "vicina_p3", "id"), discreet ? "Suono" : "Sirena");
            v.setInt(res(c, "vicina_p1", "id"), "setBackgroundResource", res(c, "vicina_aw_" + (discreet ? "blue" : "red"), "drawable"));
            v.setOnClickPendingIntent(res(c, "vicina_p1", "id"), link(c, "vicina://sos-widget", 301));
            Intent dial = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:112"));
            dial.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            v.setOnClickPendingIntent(res(c, "vicina_p2", "id"), PendingIntent.getActivity(c, 302, dial, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            v.setOnClickPendingIntent(res(c, "vicina_p3", "id"), link(c, "vicina://siren", 303));
            v.setOnClickPendingIntent(res(c, "vicina_p4", "id"), link(c, "vicina://torch", 304));
            m.updateAppWidget(id, v);
        }
    }

    // ridisegna tutti i widget (per esempio quando si attiva la modalità anonima)
    public static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        Class<?>[] cls = { Panic.class, Siren.class, Fake.class, Walk.class, Home.class, Ok.class, Torch.class };
        String[] keys = { "panic", "siren", "fake", "walk", "home", "ok", "torch" };
        for (int i = 0; i < cls.length; i++) {
            try { draw(c, m, m.getAppWidgetIds(new ComponentName(c, cls[i])), keys[i]); } catch (Exception ignored) { }
        }
        try { drawPanel(c, m, m.getAppWidgetIds(new ComponentName(c, Panel.class))); } catch (Exception ignored) { }
    }

    public static class Panic extends VicinaActionWidget { @Override protected String kind() { return "panic"; } }
    public static class Siren extends VicinaActionWidget { @Override protected String kind() { return "siren"; } }
    public static class Fake extends VicinaActionWidget { @Override protected String kind() { return "fake"; } }
    public static class Walk extends VicinaActionWidget { @Override protected String kind() { return "walk"; } }
    public static class Home extends VicinaActionWidget { @Override protected String kind() { return "home"; } }
    public static class Ok extends VicinaActionWidget { @Override protected String kind() { return "ok"; } }
    public static class Torch extends VicinaActionWidget { @Override protected String kind() { return "torch"; } }
    public static class Panel extends AppWidgetProvider {
        @Override
        public void onUpdate(Context context, AppWidgetManager manager, int[] ids) { drawPanel(context, manager, ids); }
    }
}
