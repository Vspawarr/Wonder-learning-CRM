package in.wonderlearning.crm;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

/**
 * The Wonder Learning CRM app: the live website in a full-screen browser view.
 * Strictly online: nothing is cached, and without internet it shows a
 * "No internet" screen instead of the CRM.
 */
public class MainActivity extends Activity {
    private static final int FILE_CHOOSER = 1;
    private WebView web;
    private View offline;
    private ProgressBar bar;
    private ValueCallback<Uri[]> fileCallback;
    private String lastUrl = Config.BASE_URL + "/dashboard";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.parseColor("#1B1840"));

        FrameLayout root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        root.addView(bar, new FrameLayout.LayoutParams(-1, dp(4), Gravity.TOP));
        offline = buildOfflineScreen();
        root.addView(offline, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE); // always fresh from the server
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(true); // so "open in new tab" links reach onCreateWindow
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setUserAgentString(s.getUserAgentString() + " WonderCRMApp/1.0");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);

        web.setWebViewClient(new WebViewClient() {
            @Override
            @SuppressWarnings("deprecation") // the String version works on every Android version
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return route(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                CookieManager.getInstance().flush(); // keep the login after the app is closed
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) {
                    lastUrl = req.getUrl().toString();
                    showOffline(true);
                }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int p) {
                bar.setProgress(p);
                bar.setVisibility(p < 100 ? View.VISIBLE : View.GONE);
            }

            // target="_blank" / window.open: PDFs, WhatsApp, etc.
            @Override
            public boolean onCreateWindow(WebView view, boolean dialog, boolean user, Message msg) {
                WebView probe = new WebView(MainActivity.this);
                probe.setWebViewClient(new WebViewClient() {
                    @Override
                    @SuppressWarnings("deprecation")
                    public boolean shouldOverrideUrlLoading(WebView v, String url) {
                        if (!route(url)) web.loadUrl(url);
                        v.destroy();
                        return true;
                    }
                });
                ((WebView.WebViewTransport) msg.obj).setWebView(probe);
                msg.sendToTarget();
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });
        web.setDownloadListener(new android.webkit.DownloadListener() {
            @Override
            public void onDownloadStart(String url, String ua, String disposition, String mime, long length) {
                download(url, disposition, mime);
            }
        });

        if (online()) {
            showOffline(false);
            web.loadUrl(Config.BASE_URL + "/dashboard");
        } else {
            showOffline(true);
        }
    }

    /** true = handled outside the CRM view. */
    private boolean route(String url) {
        Uri u = Uri.parse(url);
        String scheme = u.getScheme() == null ? "" : u.getScheme();
        if (scheme.equals("https") && isCrmHost(u.getHost())) {
            String path = u.getPath() == null ? "" : u.getPath();
            // PDFs and Excel files can't be shown in the app view: save them to Downloads.
            if (path.startsWith("/api/") || path.startsWith("/q/") || path.startsWith("/i/") || path.startsWith("/r/")) {
                download(url, null, null);
                return true;
            }
            if (!online()) {
                lastUrl = url;
                showOffline(true);
                return true;
            }
            return false;
        }
        // WhatsApp, phone calls, email, maps and other websites open in their own apps.
        try {
            Intent i = scheme.equals("intent") ? Intent.parseUri(url, Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, u);
            startActivity(i);
        } catch (Exception e) {
            Toast.makeText(this, "No app found to open this link.", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private boolean isCrmHost(String host) {
        if (host == null) return false;
        if (host.equalsIgnoreCase(Uri.parse(Config.BASE_URL).getHost())) return true;
        for (String h : Config.EXTRA_HOSTS) if (host.equalsIgnoreCase(h)) return true;
        return false;
    }

    private void download(String url, String disposition, String mime) {
        if (!online()) {
            showOffline(true);
            return;
        }
        try {
            String name = URLUtil.guessFileName(url, disposition, mime);
            if (url.contains("/pdf") && !name.endsWith(".pdf")) name = name.replaceAll("\\.bin$", "") + ".pdf";
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null) r.addRequestHeader("Cookie", cookie); // signed-in files
            r.addRequestHeader("User-Agent", web.getSettings().getUserAgentString());
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            r.setTitle(name);
            ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(r);
            Toast.makeText(this, "Downloading " + name + "… open it from the notification.", Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            Toast.makeText(this, "Couldn't download the file.", Toast.LENGTH_SHORT).show();
        }
    }

    @SuppressWarnings("deprecation")
    private boolean online() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo n = cm == null ? null : cm.getActiveNetworkInfo();
        return n != null && n.isConnected();
    }

    private void showOffline(boolean show) {
        offline.setVisibility(show ? View.VISIBLE : View.GONE);
        web.setVisibility(show ? View.INVISIBLE : View.VISIBLE);
        if (show) web.loadUrl("about:blank"); // never leave CRM data on screen while offline
    }

    private View buildOfflineScreen() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(32), dp(32), dp(32), dp(32));
        box.setBackgroundColor(Color.parseColor("#F6F5FB"));
        TextView title = new TextView(this);
        title.setText("No internet connection");
        title.setTextSize(22);
        title.setTextColor(Color.parseColor("#1B1840"));
        title.setGravity(Gravity.CENTER);
        TextView body = new TextView(this);
        body.setText("Wonder CRM works only online. Connect to mobile data or Wi-Fi, then tap Try again.");
        body.setTextSize(15);
        body.setTextColor(Color.parseColor("#55527A"));
        body.setGravity(Gravity.CENTER);
        body.setPadding(0, dp(12), 0, dp(24));
        Button retry = new Button(this);
        retry.setText("Try again");
        retry.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (online()) {
                    showOffline(false);
                    web.loadUrl(lastUrl);
                } else {
                    Toast.makeText(MainActivity.this, "Still offline.", Toast.LENGTH_SHORT).show();
                }
            }
        });
        box.addView(title);
        box.addView(body);
        box.addView(retry, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return box;
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!online()) showOffline(true);
    }

    @Override
    protected void onStop() {
        super.onStop();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.clearCache(true); // nothing kept for offline use
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (offline.getVisibility() != View.VISIBLE && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onActivityResult(int req, int result, Intent data) {
        if (req == FILE_CHOOSER && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileCallback = null;
            return;
        }
        super.onActivityResult(req, result, data);
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
