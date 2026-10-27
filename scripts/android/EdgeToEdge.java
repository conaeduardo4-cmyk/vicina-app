package __PACKAGE__;

import android.graphics.Color;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Vicina a tutto schermo: l'app si disegna anche sotto la barra di stato (ora, notifiche)
 * e sotto la barra di navigazione di Android, che diventano trasparenti.
 * Le misure delle barre arrivano alla pagina come variabili CSS (--sat in alto, --sab in basso),
 * così i pulsanti restano sempre raggiungibili. Con la tastiera aperta il WebView si accorcia.
 */
public class EdgeToEdge {
    private static int top, bottom, left, right;

    public static void apply(BridgeActivity activity) {
        try {
            Window w = activity.getWindow();
            WindowCompat.setDecorFitsSystemWindows(w, false);
            w.setStatusBarColor(Color.TRANSPARENT);
            w.setNavigationBarColor(Color.TRANSPARENT);
            if (Build.VERSION.SDK_INT >= 29) {
                w.setStatusBarContrastEnforced(false);
                w.setNavigationBarContrastEnforced(false);
            }
            if (Build.VERSION.SDK_INT >= 28) {
                WindowManager.LayoutParams lp = w.getAttributes();
                lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                w.setAttributes(lp);
            }
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
            c.setAppearanceLightStatusBars(false);
            c.setAppearanceLightNavigationBars(false);

            final WebView wv = activity.getBridge().getWebView();
            ViewCompat.setOnApplyWindowInsetsListener(wv, (v, insets) -> {
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
                float d = v.getResources().getDisplayMetrics().density;
                boolean kb = ime.bottom > bars.bottom;
                top = Math.round(bars.top / d);
                bottom = kb ? 0 : Math.round(bars.bottom / d);
                left = Math.round(bars.left / d);
                right = Math.round(bars.right / d);
                // tastiera aperta: il WebView finisce sopra la tastiera (come prima)
                ViewGroup.LayoutParams p = v.getLayoutParams();
                if (p instanceof ViewGroup.MarginLayoutParams) {
                    ViewGroup.MarginLayoutParams m = (ViewGroup.MarginLayoutParams) p;
                    int want = kb ? ime.bottom : 0;
                    if (m.bottomMargin != want || m.topMargin != 0 || m.leftMargin != 0 || m.rightMargin != 0) {
                        m.setMargins(0, 0, 0, want);
                        v.setLayoutParams(m);
                    }
                }
                push(wv);
                return WindowInsetsCompat.CONSUMED;
            });
            ViewCompat.requestApplyInsets(wv);
            // la pagina può caricarsi dopo: ripeto qualche volta
            Handler h = new Handler(Looper.getMainLooper());
            for (int ms : new int[] { 300, 800, 1500, 3000, 6000, 10000, 20000 }) h.postDelayed(() -> { measure(wv); push(wv); }, ms);
        } catch (Exception ignored) { }
    }

    // misura le barre direttamente dalla finestra (se il listener non è stato chiamato)
    private static void measure(WebView wv) {
        try {
            WindowInsetsCompat ins = ViewCompat.getRootWindowInsets(wv);
            if (ins == null) return;
            Insets bars = ins.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = ins.getInsets(WindowInsetsCompat.Type.ime());
            float d = wv.getResources().getDisplayMetrics().density;
            if (bars.top > 0) top = Math.round(bars.top / d);
            bottom = ime.bottom > bars.bottom ? 0 : Math.round(bars.bottom / d);
            left = Math.round(bars.left / d); right = Math.round(bars.right / d);
        } catch (Exception ignored) { }
    }

    private static void push(final WebView wv) {
        if (wv == null) return;
        if (top == 0) measure(wv);
        if (top == 0) {   // ultima riserva: altezza della barra di stato dalle risorse di sistema
            try {
                int id = wv.getResources().getIdentifier("status_bar_height", "dimen", "android");
                if (id > 0) top = Math.round(wv.getResources().getDimensionPixelSize(id) / wv.getResources().getDisplayMetrics().density);
            } catch (Exception ignored) { }
        }
        final String js = "(function(){var e=document.documentElement;if(!e)return;var s=e.style;"
            + "s.setProperty('--sat','" + top + "px');s.setProperty('--sab','" + bottom + "px');"
            + "s.setProperty('--sal','" + left + "px');s.setProperty('--sar','" + right + "px');"
            + "e.classList.add('e2e');window.__vInsets={t:" + top + ",b:" + bottom + "};})()";
        wv.post(() -> { try { wv.evaluateJavascript(js, null); } catch (Exception ignored) { } });
    }
}
