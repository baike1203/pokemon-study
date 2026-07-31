package com.example.pokeapp;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.content.ContentUris;
import android.database.Cursor;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * 全屏 WebView 壳：加载线上宝可梦学习网页。
 * - 沉浸模式隐藏状态栏 / 导航栏，无浏览器标题栏、标签栏。
 * - 线上加载失败时自动回退到内置离线副本 (assets/index.html)。
 * - 通过 JS 桥接实现"导出进度"写入平板下载目录、"选择文件导入"打开系统选择器。
 */
public class MainActivity extends Activity {

    // 线上地址：内容更新走网页，APK 无需重编（使用 GitHub Pages 稳定地址，永不换址）
    private static final String LIVE_URL = "https://baike1203.github.io/pokemon-study/";
    private static final int REQ_FILE = 1001;

    private WebView webView;
    private boolean mainLoaded = false;
    private ValueCallback<Uri[]> mFilePathCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        hideSystemUI();

        FrameLayout root = new FrameLayout(this);
        int bg = Color.parseColor("#FFF6E9");   // 柔糖果色底，避免冷启动黑屏
        root.setBackgroundColor(bg);

        webView = new WebView(this);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT);
        root.addView(webView, lp);

        // 原生加载遮罩：冷启动/断网回退前显示，页面就绪后隐藏，避免一片黑
        final TextView splash = new TextView(this);
        splash.setText("⚡ 宝可梦学习工作台\n\n加载中…");
        splash.setGravity(android.view.Gravity.CENTER);
        splash.setTextColor(Color.parseColor("#8A6D3B"));
        splash.setTextSize(24);
        splash.setBackgroundColor(bg);
        FrameLayout.LayoutParams slp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT);
        root.addView(splash, slp);
        setContentView(root);

        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        // 启用 HTTP 缓存：冷启动直接从磁盘缓存读 index.html（含 1.3MB 内联精灵图），秒开。
        // GitHub Pages 带 ETag/Last-Modified，推新版本内容变化时服务器返回新文件，更新照样生效。
        ws.setCacheMode(WebSettings.LOAD_DEFAULT);

        // 暴露给网页的 JS 桥：PokeBridge.exportSave(json)
        webView.addJavascriptInterface(new PokeJSBridge(), "PokeBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                mainLoaded = true;
                splash.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (!mainLoaded && req.isForMainFrame()) {
                    webView.loadUrl("file:///android_asset/index.html");
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return false; // 始终在 WebView 内打开，不跳浏览器
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            // 让网页里的 <input type="file"> 能打开系统文件选择器（用于"选择文件导入"）
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> filePathCallback,
                                             FileChooserParams params) {
                mFilePathCallback = filePathCallback;
                try {
                    Intent pickIntent = params.createIntent();
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        // 默认打开到"下载"目录，方便找到刚导出的进度文件
                        pickIntent.putExtra(DocumentsContract.EXTRA_INITIAL_URI,
                                MediaStore.Downloads.EXTERNAL_CONTENT_URI);
                    }
                    startActivityForResult(pickIntent, REQ_FILE);
                } catch (ActivityNotFoundException e) {
                    mFilePathCallback = null;
                    Toast.makeText(MainActivity.this, "未找到文件选择器", Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }
        });

        webView.loadUrl(LIVE_URL);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            if (mFilePathCallback == null) return;
            if (resultCode == RESULT_OK && data != null) {
                Uri uri = data.getData();
                if (uri != null) {
                    try {
                        String text = readUriText(uri);
                        final String js = "doImport(" + JSONObject.quote(text) + ")";
                        webView.evaluateJavascript(js, null);
                    } catch (Exception e) {
                        Toast.makeText(this, "读取文件失败：" + e.getMessage(), Toast.LENGTH_LONG).show();
                    }
                }
            }
            mFilePathCallback.onReceiveValue(null);
            mFilePathCallback = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    private String readUriText(Uri uri) throws Exception {
        StringBuilder sb = new StringBuilder();
        try (InputStream is = getContentResolver().openInputStream(uri);
             BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line).append('\n');
            }
        }
        return sb.toString();
    }

    /** JS 桥：把进度 JSON 写入平板"下载"目录 */
    private class PokeJSBridge {
        private static final String PREFS = "poke_save_prefs";
        private static final String KEY = "save_json";

        /** 原生持久化：写入 SharedPreferences（WebView 的 localStorage 在 file:// 离线模式下可能失效，这里做保底） */
        @JavascriptInterface
        public void saveGame(String json) {
            try {
                SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
                sp.edit().putString(KEY, json).apply();
            } catch (Exception ignored) {}
        }

        /** 原生持久化：同步返回已存进度 JSON（供网页在 localStorage 取不到时回退使用） */
        @JavascriptInterface
        public String loadGame() {
            try {
                SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
                String v = sp.getString(KEY, null);
                return v == null ? "" : v;
            } catch (Exception e) {
                return "";
            }
        }

            @JavascriptInterface
            public void exportSave(String json, String filename) {
                try {
                    if (filename == null || filename.isEmpty()) filename = "pokemon-save.json";
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        // 关键修复：Android 11+ 的 MediaStore.delete 会把文件移入「回收站」而非真正删除，
                        // 导致同名基底仍被占用，下次 insert 又自动加 (N) 后缀 → 文件越堆越多。
                        // 改用「覆盖写入」策略：找到已存在的同名文件就直接覆盖，找不到才 insert；从此永远只有 1 个文件被反复覆盖。
                        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
                        String actual = sp.getString("poke_actual_backup", null);
                        Uri target = null;
                        if (actual != null) {
                            try (Cursor c = getContentResolver().query(
                                    MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                                    new String[]{MediaStore.Downloads._ID},
                                    MediaStore.Downloads.DISPLAY_NAME + "=?",
                                    new String[]{actual}, null)) {
                                if (c != null && c.moveToFirst()) {
                                    target = ContentUris.withAppendedId(MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                                            c.getLong(c.getColumnIndexOrThrow(MediaStore.Downloads._ID)));
                                }
                            }
                        }
                        if (target == null) {
                            ContentValues cv = new ContentValues();
                            cv.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                            cv.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                            cv.put(MediaStore.Downloads.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS);
                            target = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                            // 读取真实生成的文件名（MediaStore 可能自动加了 (N) 后缀），记住它以便下次覆盖，避免无限循环
                            try (Cursor c = getContentResolver().query(
                                    MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                                    new String[]{MediaStore.Downloads.DISPLAY_NAME},
                                    MediaStore.Downloads._ID + "=?",
                                    new String[]{String.valueOf(ContentUris.parseId(target))}, null)) {
                                if (c != null && c.moveToFirst()) {
                                    actual = c.getString(c.getColumnIndexOrThrow(MediaStore.Downloads.DISPLAY_NAME));
                                    sp.edit().putString("poke_actual_backup", actual).apply();
                                }
                            }
                        }
                        try (OutputStream os = getContentResolver().openOutputStream(target)) {
                            os.write(json.getBytes(StandardCharsets.UTF_8));
                        }
                        // 清理历史孤儿：删除「同名基底、但不等于当前文件」的旧备份（移入回收站，正常视图即消失）
                        int dot = filename.lastIndexOf('.');
                        String base = dot > 0 ? filename.substring(0, dot) : filename;
                        try (Cursor c = getContentResolver().query(
                                MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                                new String[]{MediaStore.Downloads._ID, MediaStore.Downloads.DISPLAY_NAME},
                                MediaStore.Downloads.DISPLAY_NAME + " LIKE ?",
                                new String[]{base + "%"}, null)) {
                            if (c != null) {
                                int idIdx = c.getColumnIndexOrThrow(MediaStore.Downloads._ID);
                                int nmIdx = c.getColumnIndexOrThrow(MediaStore.Downloads.DISPLAY_NAME);
                                while (c.moveToNext()) {
                                    if (!c.getString(nmIdx).equals(actual)) {
                                        getContentResolver().delete(ContentUris.withAppendedId(
                                                MediaStore.Downloads.EXTERNAL_CONTENT_URI, c.getLong(idIdx)), null, null);
                                    }
                                }
                            }
                        }
                        showToast("进度已自动备份到：平板「下载 / Download」\n" + actual);
                    } else {
                        File dir = android.os.Environment
                                .getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS);
                        dir.mkdirs();
                        File f = new File(dir, filename);
                        try (FileOutputStream fos = new FileOutputStream(f)) {
                            fos.write(json.getBytes(StandardCharsets.UTF_8));
                        }
                        showToast("进度已自动备份到：" + f.getAbsolutePath());
                    }
                } catch (Exception e) {
                    showToast("自动备份失败：" + e.getMessage());
                }
            }

        /** 直接读取"下载"目录里最新的 pokemon-save 进度文件并导入（APP 内一键导入，省去选文件） */
        @JavascriptInterface
        public void importLatest() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                showToast("当前系统版本请改用「选择文件」导入");
                return;
            }
            try {
                Uri uri = null;
                String name = null;
                try (Cursor c = getContentResolver().query(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                        new String[]{MediaStore.Downloads._ID, MediaStore.Downloads.DISPLAY_NAME},
                        MediaStore.Downloads.DISPLAY_NAME + " LIKE ?",
                        new String[]{"pokemon-save-%"},
                        MediaStore.Downloads.DATE_MODIFIED + " DESC")) {
                    if (c != null && c.moveToFirst()) {
                        long id = c.getLong(c.getColumnIndexOrThrow(MediaStore.Downloads._ID));
                        name = c.getString(c.getColumnIndexOrThrow(MediaStore.Downloads.DISPLAY_NAME));
                        uri = ContentUris.withAppendedId(MediaStore.Downloads.EXTERNAL_CONTENT_URI, id);
                    }
                }
                if (uri == null) {
                    showToast("下载目录未找到 pokemon-save 进度文件，请改用选择文件");
                    return;
                }
                String text = readUriText(uri);
                final String js = "doImport(" + JSONObject.quote(text) + ")";
                webView.evaluateJavascript(js, null);
                showToast("已自动导入：" + name);
            } catch (Exception e) {
                showToast("自动导入失败，请改用选择文件：" + e.getMessage());
            }
        }

        private void showToast(final String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show());
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }

    private void hideSystemUI() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN);
        }
    }
}
