package __PACKAGE__;

// Widget di Vicina per la schermata Home (Android): un tocco apre Vicina e fa partire
// il conto alla rovescia dell'SOS (5 secondi per annullare). In modalità anonima diventa celeste e neutro.
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

public class VicinaWidget extends AppWidgetProvider {
    public static final String PREFS = "vicina_widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        updateAll(context, manager, ids);
    }

    public static void updateAll(Context context, AppWidgetManager manager, int[] ids) {
        if (ids == null) return;
        boolean discreet = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("discreet", false);
        int layout = context.getResources().getIdentifier("vicina_widget", "layout", context.getPackageName());
        int text = context.getResources().getIdentifier("vicina_widget_text", "id", context.getPackageName());
        int sub = context.getResources().getIdentifier("vicina_widget_sub", "id", context.getPackageName());
        int root = context.getResources().getIdentifier("vicina_widget_root", "id", context.getPackageName());
        int bgRed = context.getResources().getIdentifier("vicina_widget_bg", "drawable", context.getPackageName());
        int bgBlue = context.getResources().getIdentifier("vicina_widget_bg_blue", "drawable", context.getPackageName());
        for (int id : ids) {
            RemoteViews v = new RemoteViews(context.getPackageName(), layout);
            v.setTextViewText(text, discreet ? "Vicina" : "SOS");
            v.setTextViewText(sub, discreet ? "tocca" : "tocca per avvisare");
            v.setInt(root, "setBackgroundResource", discreet ? bgBlue : bgRed);
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("vicina://sos"));
            i.setPackage(context.getPackageName());
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent pi = PendingIntent.getActivity(context, 7, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            v.setOnClickPendingIntent(root, pi);
            manager.updateAppWidget(id, v);
        }
    }
}
