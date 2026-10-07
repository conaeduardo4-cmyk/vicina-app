package __PACKAGE__;

// Widget «Chiama 112» (Android): un tocco apre il telefono con il 112 già composto, basta premere chiama.
// (Android non permette a nessuna app di chiamare da sola un numero di emergenza.)
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

public class VicinaCallWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        int layout = context.getResources().getIdentifier("vicina_call_widget", "layout", context.getPackageName());
        int root = context.getResources().getIdentifier("vicina_call_root", "id", context.getPackageName());
        for (int id : ids) {
            RemoteViews v = new RemoteViews(context.getPackageName(), layout);
            Intent i = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:112"));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent pi = PendingIntent.getActivity(context, 112, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            v.setOnClickPendingIntent(root, pi);
            manager.updateAppWidget(id, v);
        }
    }
}
