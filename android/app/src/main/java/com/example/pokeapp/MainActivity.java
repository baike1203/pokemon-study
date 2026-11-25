package com.example.pokeapp;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.view.Gravity;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.RelativeLayout;
import android.graphics.Typeface;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.TypedValue;
import android.content.ContentUris;
import android.database.Cursor;
import android.provider.DocumentsContract;
import android.provider.Settings;
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

    // 线上地址：Cloudflare Pages（支持 Functions，/api/tts 云端语音可用；GitHub Pages 不支持 Functions 故不可用）
    private static final String LIVE_URL = "https://pokemon-study.pages.dev/";
    private static final int REQ_FILE = 1001;

    private WebView webView;
    private boolean mainLoaded = false;
    private ValueCallback<Uri[]> mFilePathCallback;

    // ---------- 应用内启动页 ----------
    private View splashView;                 // 启动页根布局
    private View splashBall;                 // 精灵球（呼吸动画作用对象）
    private TextView splashStatus;           // 可变状态文案
    private ObjectAnimator breathX, breathY; // 呼吸动画，淡出时要 cancel，避免泄漏
    private final Handler splashHandler = new Handler(Looper.getMainLooper());
    private long splashStartAt;              // 启动页出现时刻 → 用于补足最短展示时长
    private boolean splashHidden = false;
    private boolean offlineTried = false;    // 是否已切过内置离线副本
    // v3.54.11：离线版可一键回线上（不必强制停止 App）
    private Button backOnlineBtn;
    private boolean retryingOnline = false;  // 正在重试线上地址
    private boolean offlineActive = false;   // 当前应展示离线副本（防失败页的 onPageFinished 误藏按钮）
    private Runnable retryTimeout;           // 重试 12 秒仍未就绪 → 退回离线版

    private static final long SPLASH_MIN_MS = 600;    // 最短展示：缓存秒开时别一闪而过
    private static final long SLOW_HINT_MS  = 6000;   // 6 秒未就绪 → 提示网络慢
    private static final long OFFLINE_MS    = 12000;  // 12 秒未就绪 → 强制切离线，别让孩子无限等
    private static final int  SPLASH_BALL_DP = 120;   // 精灵球直径（与 splash_window.xml 保持一致）

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        hideSystemUI();

        float density = getResources().getDisplayMetrics().density;
        int unit = Math.max(1, (int) (density + 0.5f));          // 1dp ≈ 几 px
        int ballPx = (int) (SPLASH_BALL_DP * density + 0.5f);

        FrameLayout root = new FrameLayout(this);
        int bg = Color.parseColor("#FFF7E6");   // 方案 A：与 App 内首页同色，淡出时不跳色
        root.setBackgroundColor(bg);

        webView = new WebView(this);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT);
        root.addView(webView, lp);

        // ---- 应用内启动页 ----
        // 用 RelativeLayout 让精灵球「精确居中」：与 splash_window.xml 里的球位置完全一致，
        // 否则从冷启动窗口切到应用内时，球会往上跳一下。
        RelativeLayout splash = new RelativeLayout(this);
        splash.setBackgroundColor(bg);

        ImageView ball = new ImageView(this);
        ball.setId(1);
        ball.setImageResource(R.mipmap.ic_splash_ball);
        ball.setScaleType(ImageView.ScaleType.FIT_CENTER);
        ball.setLayerType(View.LAYER_TYPE_HARDWARE, null);   // 缩放动画走硬件层，更顺滑
        RelativeLayout.LayoutParams blp = new RelativeLayout.LayoutParams(ballPx, ballPx);
        blp.addRule(RelativeLayout.CENTER_IN_PARENT);
        splash.addView(ball, blp);
        splashBall = ball;

        LinearLayout texts = new LinearLayout(this);
        texts.setOrientation(LinearLayout.VERTICAL);
        texts.setGravity(Gravity.CENTER_HORIZONTAL);

        TextView title = new TextView(this);
        title.setText("宝可梦学习工作台");
        title.setTextColor(Color.parseColor("#7A4E1E"));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 40);
        title.setTypeface(null, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        texts.addView(title);

        splashStatus = new TextView(this);
        splashStatus.setText("⚡ 正在准备今天的冒险…");
        splashStatus.setTextColor(Color.parseColor("#B08A55"));
        splashStatus.setTextSize(TypedValue.COMPLEX_UNIT_SP, 21);
        splashStatus.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams stlp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        stlp.topMargin = 16 * unit;
        texts.addView(splashStatus, stlp);

        RelativeLayout.LayoutParams tlp = new RelativeLayout.LayoutParams(
                RelativeLayout.LayoutParams.WRAP_CONTENT, RelativeLayout.LayoutParams.WRAP_CONTENT);
        tlp.addRule(RelativeLayout.CENTER_HORIZONTAL);
        tlp.addRule(RelativeLayout.BELOW, 1);
        tlp.topMargin = 30 * unit;
        splash.addView(texts, tlp);

        FrameLayout.LayoutParams slp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT);
        root.addView(splash, slp);

        // 离线版「回到在线版」按钮：默认隐藏，只在 file:// 离线页显示。
        // 放在页面左下角、底部导航栏上方 12dp，不盖住「今日任务」等导航键；
        // 右下角是伙伴挂件，也避开了。圆角描边沿用启动页米黄/棕色调。
        backOnlineBtn = new Button(this);
        backOnlineBtn.setText("回到在线版");
        backOnlineBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        backOnlineBtn.setTextColor(Color.parseColor("#7A4E1E"));
        backOnlineBtn.setAllCaps(false);
        GradientDrawable btnBg = new GradientDrawable();
        btnBg.setColor(Color.parseColor("#FFFFFF"));
        btnBg.setStroke(2, Color.parseColor("#E6C27A"));
        btnBg.setCornerRadius(22 * unit);
        backOnlineBtn.setBackground(btnBg);
        backOnlineBtn.setPadding(18 * unit, 8 * unit, 18 * unit, 8 * unit);
        backOnlineBtn.setVisibility(View.GONE);
        backOnlineBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { retryOnline(); }
        });
        FrameLayout.LayoutParams obp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.START);
        // 与网页 CSS 一致：@media (max-height:860px) 时 nav 高 68px，否则 100px
        int navHeightDp = getResources().getConfiguration().screenHeightDp <= 860 ? 68 : 100;
        obp.leftMargin = 14 * unit;
        obp.bottomMargin = (navHeightDp + 12) * unit;
        root.addView(backOnlineBtn, obp);

        setContentView(root);
        splashView = splash;

        // 精灵球呼吸：1.0 ↔ 1.07，1.4 秒一来回，缓入缓出。
        // 不用进度条——真实加载时长未知，假进度条反而让孩子等得焦躁。
        breathX = ObjectAnimator.ofFloat(ball, View.SCALE_X, 1.0f, 1.07f);
        breathY = ObjectAnimator.ofFloat(ball, View.SCALE_Y, 1.0f, 1.07f);
        AccelerateDecelerateInterpolator ease = new AccelerateDecelerateInterpolator();
        for (ObjectAnimator a : new ObjectAnimator[]{breathX, breathY}) {
            a.setDuration(1400);
            a.setRepeatCount(ValueAnimator.INFINITE);
            a.setRepeatMode(ValueAnimator.REVERSE);
            a.setInterpolator(ease);
            a.start();
        }

        splashStartAt = SystemClock.elapsedRealtime();
        splashHandler.postDelayed(new Runnable() {
            @Override public void run() {
                if (splashHidden) return;
                splashStatus.setText("网络有点慢，再等一下…");
            }
        }, SLOW_HINT_MS);
        splashHandler.postDelayed(new Runnable() {
            @Override public void run() {
                if (splashHidden) return;
                goOffline();
            }
        }, OFFLINE_MS);

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
                hideSplash();
                if (url != null && url.startsWith(LIVE_URL) && !offlineActive) {
                    // 线上页就绪：撤掉重试状态并隐藏按钮
                    retryingOnline = false;
                    if (retryTimeout != null) { splashHandler.removeCallbacks(retryTimeout); retryTimeout = null; }
                    if (backOnlineBtn != null) {
                        backOnlineBtn.setEnabled(true);
                        backOnlineBtn.setText("回到在线版");
                        backOnlineBtn.setVisibility(View.GONE);
                    }
                } else if (offlineTried && backOnlineBtn != null) {
                    // 离线副本就绪：显示一键回线上按钮
                    backOnlineBtn.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (!req.isForMainFrame()) return;
                if (retryingOnline) {
                    backToOffline("网络还不行，已留在离线版");
                } else if (!mainLoaded) {
                    goOffline();
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
        /** 测试模式口令：只存在于原生层，网页源码 / 线上页面看不到明文（v3.48.0） */
        private static final String TEST_CODE = "112233";

        /** 测试模式口令校验：网页把用户输入交给原生判断，前端不再写死密码 */
        @JavascriptInterface
        public boolean verifyTestCode(String code) {
            return TEST_CODE.equals(code);
        }

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

        /** 登录令牌：存原生 SharedPreferences（希沃清 WebView 也清不到），让娃免重复登录 */
        @JavascriptInterface
        public String getToken() {
            try {
                SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
                String v = sp.getString("poke_token", null);
                return v == null ? "" : v;
            } catch (Exception e) { return ""; }
        }
        @JavascriptInterface
        public void saveToken(String token) {
            try {
                SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
                sp.edit().putString("poke_token", token == null ? "" : token).apply();
            } catch (Exception ignored) {}
        }

            @JavascriptInterface
            public void exportSave(String json, String filename) {
                writeSave(json, filename, true);   // 手动导出：成功弹完整位置提示
            }

            /** 自动备份：3 槽位轮换文件名 + 静默写入（成功不弹 Toast 打扰孩子；失败仍提示） */
            @JavascriptInterface
            public void autoBackupSave(String json) {
                writeSave(json, nextAutoBackupName(), false);
            }

            /** v3.50.2：自动备份槽位轮换——-1/-2/-3 三个固定槽位轮流写入，每槽位复用同一真实文件覆盖，
                既保留「不产生 (N) 后缀新文件」的能力，又防止坏档覆盖掉唯一备份。 */
            private String nextAutoBackupName() {
                SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
                int slot = sp.getInt("poke_backup_slot", 0) % 3 + 1;   // 1→2→3→1 循环
                sp.edit().putInt("poke_backup_slot", slot).apply();
                return "pokemon-study-auto-backup-" + slot + ".json";
            }

            private void writeSave(String json, String filename, boolean showToastOnSuccess) {
                try {
                    if (filename == null || filename.isEmpty()) filename = "pokemon-save.json";
                    // 自动备份固定用 pokemon-study-auto-backup.json：需要「始终覆盖同一文件」策略；
                    // 手动导出用时间戳文件名（天然唯一）：直接新建，不走覆盖追踪，避免两类文件名互相串台。
                    boolean isAutoBackup = filename.startsWith("pokemon-study-auto-backup");
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        // Android 11+ 用 MediaStore；自动备份靠 SP 记住每槽位的真实文件名反复覆盖，避免 (N) 后缀越堆越多。
                        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
                        // v3.50.2：槽位轮换——从文件名解析槽位号，每槽位独立记录真实文件名；
                        // 槽位 1 首次沿用旧版单文件键 poke_actual_backup（直接复用旧文件，避免「旧文件 + 3 个新文件」变 4 个）。
                        int slot = 1;
                        if (isAutoBackup){
                            String s = filename.substring("pokemon-study-auto-backup".length());
                            int dot = s.indexOf('.');
                            String num = (dot > 0 ? s.substring(0, dot) : s).replace("-", "");
                            try { slot = Integer.parseInt(num); } catch (Exception e) { slot = 1; }
                        }
                        String actualKey = "poke_actual_backup_" + slot;
                        String actual = sp.getString(actualKey, null);
                        if (isAutoBackup && actual == null && slot == 1) actual = sp.getString("poke_actual_backup", null);   // 旧版单文件迁移
                        if (isAutoBackup && actual != null) sp.edit().putString(actualKey, actual).apply();   // 迁移值固化到新键
                        Uri target = null;
                        // v3.54.7：手动导出的文件名带时间戳、天然唯一，绝不能复用自动备份槽位记录的 URI。
                        // 旧逻辑对手动导出也读 poke_actual_backup_1，一旦自动备份跑过，
                        // 手动导出的 JSON 就覆盖写进 pokemon-study-auto-backup-1.json，
                        // Toast 却报时间戳文件名 → 下载目录里根本找不到该文件，而 3 个自动备份还在。
                        if (isAutoBackup && actual != null) {
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
                            if (target == null) {   // v3.48.2 B10：存储满/无写入权限时 insert 可能返回 null——明确提示，避免 NPE 后只显示 "保存失败：null"
                                showToast("进度保存失败：存储空间不足或没有写入权限");
                                return;
                            }
                            // 读取真实生成的文件名（MediaStore 可能自动加了 (N) 后缀），记住它以便下次覆盖，避免无限循环
                            try (Cursor c = getContentResolver().query(
                                    MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                                    new String[]{MediaStore.Downloads.DISPLAY_NAME},
                                    MediaStore.Downloads._ID + "=?",
                                    new String[]{String.valueOf(ContentUris.parseId(target))}, null)) {
                                if (c != null && c.moveToFirst()) {
                                    actual = c.getString(c.getColumnIndexOrThrow(MediaStore.Downloads.DISPLAY_NAME));
                                    if (isAutoBackup) sp.edit().putString(actualKey, actual).apply();
                                }
                            }
                        }
                        try (OutputStream os = getContentResolver().openOutputStream(target)) {
                            os.write(json.getBytes(StandardCharsets.UTF_8));
                        }
                        if (isAutoBackup) {
                            // v3.50.2：仅清理「当前槽位」同名基底的历史孤儿（如 -1 与 -1 (1)），
                            // LIKE 按槽位前缀匹配，避免误删其它槽位的备份文件
                            String base = "pokemon-study-auto-backup-" + slot;
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
                        }
                        if (showToastOnSuccess) {
                            // 报 MediaStore 真正落盘的文件名：同名时系统会自动加 (1) 后缀，
                            // 报期望文件名会让用户在下载目录里白找。
                            final String savedName = (actual == null || actual.isEmpty()) ? filename : actual;
                            showToast(isAutoBackup
                                    ? "进度已自动备份到：平板「下载 / Download」\n" + savedName
                                    : "进度文件已下载到：平板「下载 / Download」\n" + savedName);
                        }
                    } else {
                        File dir = android.os.Environment
                                .getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS);
                        dir.mkdirs();
                        File f = new File(dir, filename);
                        try (FileOutputStream fos = new FileOutputStream(f)) {
                            fos.write(json.getBytes(StandardCharsets.UTF_8));
                        }
                        if (showToastOnSuccess) {
                            showToast("进度已保存到：" + f.getAbsolutePath());
                        }
                    }
                } catch (Exception e) {
                    showToast("进度保存失败：" + e.getMessage());
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
                        "(" + MediaStore.Downloads.DISPLAY_NAME + " LIKE ? OR " + MediaStore.Downloads.DISPLAY_NAME + " LIKE ?)",
                        new String[]{"pokemon-save-%", "pokemon-study-auto-backup%"},
                        MediaStore.Downloads.DATE_MODIFIED + " DESC")) {
                    if (c != null && c.moveToFirst()) {
                        long id = c.getLong(c.getColumnIndexOrThrow(MediaStore.Downloads._ID));
                        name = c.getString(c.getColumnIndexOrThrow(MediaStore.Downloads.DISPLAY_NAME));
                        uri = ContentUris.withAppendedId(MediaStore.Downloads.EXTERNAL_CONTENT_URI, id);
                    }
                }
                if (uri == null) {
                    showToast("下载目录未找到进度备份文件，请改用选择文件");
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

        /* ==================== v3.50.7：App 自更新 ==================== */

        /** 返回本机 APK 版本，形如 {"code":3,"name":"v3.50.5"}；网页据此判断是否要提示更新 */
        @JavascriptInterface
        public String getAppInfo() {
            try {
                android.content.pm.PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
                long code = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P)
                        ? pi.getLongVersionCode() : pi.versionCode;
                JSONObject o = new JSONObject();
                o.put("code", (int) code);
                o.put("name", pi.versionName == null ? "" : pi.versionName);
                return o.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        /**
         * 下载并唤起系统安装器（网页「一键更新」按钮调用）。
         *
         * 走 DownloadManager 而不是「自己开线程 + FileProvider」，原因：
         *  1) 本工程没有任何 dependencies（无 androidx），拿不到 FileProvider，
         *     而 Android 7+ 把 file:// Uri 传给其他应用会直接抛 FileUriExposedException；
         *  2) DownloadManager 自带通知栏进度、断点续传，且返回可直接授予读权限的 content:// Uri。
         */
        @JavascriptInterface
        public void installApkUpdate(final String url) {
            if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
                showToast("更新地址无效");
                return;
            }
            try {
                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm == null) { showToast("系统下载服务不可用"); return; }

                DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                req.setTitle("精灵学院 更新包");
                req.setDescription("正在下载新版本，完成后会自动弹出安装");
                req.setMimeType("application/vnd.android.package-archive");
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "poke-study-update.apk");

                final long id = dm.enqueue(req);
                showToast("开始下载更新包…");

                // 轮询而不是监听广播：targetSdk 33+ 注册系统广播必须显式指定 RECEIVER_EXPORTED，
                // 各 ROM 行为还不一致，轮询最省心（只在一个后台线程里，开销可忽略）。
                new Thread(() -> {
                    for (int i = 0; i < 600; i++) {          // 约 8 分钟上限
                        try { Thread.sleep(800); } catch (InterruptedException e) { return; }
                        int status = -1;
                        try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(id))) {
                            if (c != null && c.moveToFirst()) {
                                status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                            }
                        } catch (Exception ignored) { }
                        if (status == DownloadManager.STATUS_SUCCESSFUL) {
                            Uri uri = dm.getUriForDownloadedFile(id);
                            if (uri == null) { showToast("下载完成但取不到文件"); return; }
                            launchInstaller(uri);
                            return;
                        }
                        if (status == DownloadManager.STATUS_FAILED) {
                            showToast("下载失败，请检查平板网络后重试");
                            return;
                        }
                    }
                    showToast("下载超时，请稍后重试");
                }).start();
            } catch (Exception e) {
                showToast("启动更新失败：" + e.getClass().getSimpleName());
            }
        }

        /** 唤起系统安装器；Android 8+ 需先拿到「安装未知应用」授权 */
        private void launchInstaller(final Uri apkUri) {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        && !getPackageManager().canRequestPackageInstalls()) {
                    showToast("请允许「精灵学院」安装应用，然后回来再点一次更新");
                    try {
                        startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + getPackageName())));
                    } catch (Exception ignored) { }
                    return;
                }
                Intent it = new Intent(Intent.ACTION_VIEW);
                it.setDataAndType(apkUri, "application/vnd.android.package-archive");
                it.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    startActivity(it);
                } catch (Exception e) {
                    showToast("没有可用的安装器：" + e.getClass().getSimpleName());
                }
            });
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

    /**
     * 隐藏启动页：补足最短展示时长（避免缓存秒开时一闪而过），
     * 再 250ms 淡出 + 轻微放大，替代原来的硬切 GONE。
     */
    private void hideSplash() {
        if (splashHidden) return;
        splashHidden = true;
        long shown = SystemClock.elapsedRealtime() - splashStartAt;
        long delay = Math.max(0, SPLASH_MIN_MS - shown);
        splashHandler.postDelayed(new Runnable() {
            @Override public void run() {
                if (breathX != null) breathX.cancel();
                if (breathY != null) breathY.cancel();
                if (splashBall != null) {
                    splashBall.setScaleX(1f);
                    splashBall.setScaleY(1f);   // 复位，避免从呼吸的中间值继续放大时回跳
                }
                if (splashView == null) return;
                splashView.animate()
                        .alpha(0f)
                        .scaleX(1.04f)
                        .scaleY(1.04f)
                        .setDuration(250)
                        .setInterpolator(new AccelerateDecelerateInterpolator())
                        .withEndAction(new Runnable() {
                            @Override public void run() {
                                if (splashView != null && splashView.getParent() instanceof FrameLayout) {
                                    ((FrameLayout) splashView.getParent()).removeView(splashView);
                                    splashView = null;
                                }
                            }
                        }).start();
            }
        }, delay);
    }

    /** 首次启动加载线上失败：切到内置离线副本，并更新启动页文案让等待有交代 */
    private void goOffline() {
        if (offlineTried) return;
        offlineTried = true;
        if (splashStatus != null) splashStatus.setText("正在打开离线模式…");
        backToOffline(null);
    }

    /** 回到内置离线副本；按钮的显示交给 onPageFinished，避免启动时在启动页上闪一下 */
    private void backToOffline(String msg) {
        retryingOnline = false;
        offlineActive = true;
        if (retryTimeout != null) { splashHandler.removeCallbacks(retryTimeout); retryTimeout = null; }
        if (backOnlineBtn != null) {
            backOnlineBtn.setEnabled(true);
            backOnlineBtn.setText("回到在线版");
        }
        webView.loadUrl("file:///android_asset/index.html");
        if (msg != null) Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    /** 离线版点「回到在线版」：重新加载线上地址，12 秒还没好就自动退回离线版 */
    private void retryOnline() {
        if (retryingOnline) return;
        retryingOnline = true;
        offlineActive = false;
        backOnlineBtn.setEnabled(false);
        backOnlineBtn.setText("正在连接…");
        webView.loadUrl(LIVE_URL);
        retryTimeout = new Runnable() {
            @Override public void run() {
                if (retryingOnline) backToOffline("网络还不行，已留在离线版");
            }
        };
        splashHandler.postDelayed(retryTimeout, OFFLINE_MS);
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
