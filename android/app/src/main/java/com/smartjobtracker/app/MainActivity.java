package com.smartjobtracker.app;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.ValueCallback;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import java.nio.charset.StandardCharsets;

/**
 * Capacitor host activity. Beyond the default bridge, it turns SmartJobTracker
 * into an Android share target: text shared into the app (LinkedIn → Share →
 * SmartJobTracker) arrives as an ACTION_SEND intent, and we forward the shared
 * link to the web layer, which opens the "add candidature from LinkedIn" flow.
 *
 * The manifest declares the ACTION_SEND / text/plain intent-filter that makes
 * the app show up in the share sheet.
 */
public class MainActivity extends BridgeActivity {

    private static final String SHARE_HOOK = "window.__sjtReceiveSharedUrl";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Cold start: the share sheet launched us with the SEND intent.
        handleShareIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // launchMode="singleTask": a share while the app is already open lands here.
        setIntent(intent);
        handleShareIntent(intent);
    }

    private void handleShareIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String type = intent.getType();
        if (!Intent.ACTION_SEND.equals(action) || type == null || !type.startsWith("text/")) return;

        String shared = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (shared == null || shared.trim().isEmpty()) return;

        deliverToWeb(shared.trim());
    }

    /**
     * Hand the shared text to the web app's window.__sjtReceiveSharedUrl hook
     * (installed by shareIntake.js). On a cold start the web bundle may not have
     * run yet, so we poll on a short timer until the hook reports it consumed the
     * value — or we give up after ~14s. The text is Base64-encoded to sidestep
     * any JS-string escaping issues (URLs, unicode, quotes).
     */
    private void deliverToWeb(final String sharedText) {
        final WebView webView = (getBridge() != null) ? getBridge().getWebView() : null;
        if (webView == null) return;

        final String b64 = Base64.encodeToString(
                sharedText.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
        final String js =
                "(function(){try{" +
                "var t=decodeURIComponent(escape(window.atob('" + b64 + "')));" +
                "if(typeof " + SHARE_HOOK + "==='function'){return !!" + SHARE_HOOK + "(t);}" +
                "return false;" +
                "}catch(e){return false;}})();";

        final Handler handler = new Handler(Looper.getMainLooper());
        final int[] attempts = {0};
        final Runnable poll = new Runnable() {
            @Override
            public void run() {
                webView.evaluateJavascript(js, new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        boolean delivered = "true".equals(value);
                        if (!delivered && ++attempts[0] < 20) {
                            handler.postDelayed(MainActivity.this.pollRunnable, 700);
                        }
                    }
                });
            }
        };
        this.pollRunnable = poll;
        handler.postDelayed(poll, 600);
    }

    // Held so the async evaluateJavascript callback can re-schedule the same task.
    private Runnable pollRunnable;
}
