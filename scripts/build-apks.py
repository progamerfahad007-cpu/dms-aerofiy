#!/usr/bin/env python3
"""
Compiles genuine, signed, installable Android WebView APKs for aerofiy DMS:
  1. aerofiy-salesman-app.apk             (Salesman Portal)
  2. aerofiy-distribution-manager-app.apk (Distribution / Warehouse Manager & Delivery Portal)
  3. aerofiy-field-app.apk                (Combined Salesman, Distribution Manager & Deliveryman)

Uses official Android SDK build-tools (aapt2, d8, zipalign, apksigner) + OpenJDK 17.
Zero external Gradle dependencies; installs cleanly on Android 7.0 (API 24) through Android 15 (API 35).
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
    HAS_PIL = True
except Exception:
    HAS_PIL = False

ROOT_DIR = Path(__file__).resolve().parent.parent
JDK_BIN = Path("/tmp/jdk17/bin")
if JDK_BIN.exists():
    os.environ["JAVA_HOME"] = "/tmp/jdk17"
    os.environ["PATH"] = f"{JDK_BIN}:{os.environ.get('PATH', '')}"

SDK_DIR = Path("/tmp/android-sdk")
BUILD_TOOLS = SDK_DIR / "build-tools" / "34.0.0"
PLATFORM_JAR = SDK_DIR / "platforms" / "android-34" / "android.jar"
KEYSTORE_PATH = SDK_DIR / "aerofiy-release.jks"
WORK_ROOT = Path("/tmp/aerofiy-apk-build")

PUBLIC_DIR = ROOT_DIR / "public"
CPANEL_DEPLOY_DIR = ROOT_DIR / "cpanel-deploy"
SOURCE_ICON = PUBLIC_DIR / "pwa-512x512.png"
FALLBACK_ICON_192 = PUBLIC_DIR / "pwa-192x192.png"

APPS = [
    {
        "filename": "aerofiy-salesman-app.apk",
        "package": "com.aerofiy.dms.salesman",
        "label": "aerofiy Salesman",
        "start_url": "https://dms.aerofiy.com/?app=salesman",
        "subtitle": "Sales Representative Field App",
        "version_code": 1,
        "version_name": "1.0.0",
    },
    {
        "filename": "aerofiy-distribution-manager-app.apk",
        "package": "com.aerofiy.dms.distribution",
        "label": "aerofiy Distribution",
        "start_url": "https://dms.aerofiy.com/?app=distribution",
        "subtitle": "Distribution & Warehouse Manager App",
        "version_code": 1,
        "version_name": "1.0.0",
    },
    {
        "filename": "aerofiy-field-app.apk",
        "package": "com.aerofiy.dms.field",
        "label": "aerofiy Field",
        "start_url": "https://dms.aerofiy.com/?app=field",
        "subtitle": "Salesman, Distribution & Delivery App",
        "version_code": 1,
        "version_name": "1.0.0",
    },
]

DENSITIES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def run(cmd, cwd=None):
    print("+", " ".join(str(c) for c in cmd), flush=True)
    res = subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if res.returncode != 0:
        print(res.stdout, file=sys.stderr)
        raise RuntimeError(f"Command failed ({res.returncode}): {' '.join(str(c) for c in cmd)}")
    if res.stdout.strip():
        print(res.stdout.strip())


def ensure_keystore():
    if KEYSTORE_PATH.exists():
        return
    run([
        "keytool", "-genkeypair", "-v",
        "-keystore", str(KEYSTORE_PATH),
        "-alias", "aerofiy",
        "-keyalg", "RSA",
        "-keysize", "2048",
        "-validity", "10000",
        "-storepass", "aerofiy2026",
        "-keypass", "aerofiy2026",
        "-dname", "CN=aerofiy DMS, OU=Distribution Operations, O=aerofiy, L=Dhaka, ST=Dhaka, C=BD",
    ])


def generate_icons(res_dir: Path):
    if HAS_PIL:
        if SOURCE_ICON.exists():
            base_img = Image.open(SOURCE_ICON).convert("RGBA")
        else:
            base_img = Image.new("RGBA", (512, 512), (5, 150, 105, 255))

        for folder, size in DENSITIES.items():
            out_dir = res_dir / folder
            out_dir.mkdir(parents=True, exist_ok=True)
            resized = base_img.resize((size, size), Image.Resampling.LANCZOS)
            resized.save(out_dir / "ic_launcher.png", format="PNG")

            mask = Image.new("L", (size, size), 0)
            draw = ImageDraw.Draw(mask)
            draw.ellipse((0, 0, size - 1, size - 1), fill=255)
            round_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            round_img.paste(resized, (0, 0), mask)
            round_img.save(out_dir / "ic_launcher_round.png", format="PNG")
    else:
        src = FALLBACK_ICON_192 if FALLBACK_ICON_192.exists() else SOURCE_ICON
        out_dir = res_dir / "mipmap-xxxhdpi"
        out_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, out_dir / "ic_launcher.png")
        shutil.copy2(src, out_dir / "ic_launcher_round.png")


def manifest_xml(app: dict) -> str:
    return f'''<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="{app['package']}"
    android:versionCode="{app['version_code']}"
    android:versionName="{app['version_name']}">

    <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="34" />

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.CAMERA" />

    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.location.gps" android:required="false" />

    <application
        android:allowBackup="true"
        android:hardwareAccelerated="true"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:label="{app['label']}"
        android:supportsRtl="true"
        android:theme="@android:style/Theme.Material.Light.NoActionBar"
        android:usesCleartextTraffic="false">

        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|screenSize|keyboardHidden|smallestScreenSize|screenLayout"
            android:exported="true"
            android:launchMode="singleTask"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <provider
            android:name=".CaptureFileProvider"
            android:authorities="{app['package']}.captureprovider"
            android:exported="false"
            android:grantUriPermissions="true" />
    </application>
</manifest>
'''


def capture_provider_java(pkg: str) -> str:
    return f'''package {pkg};

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

public class CaptureFileProvider extends ContentProvider {{
    @Override
    public boolean onCreate() {{
        return true;
    }}

    private File resolveFile(Uri uri) throws FileNotFoundException {{
        if (getContext() == null) throw new FileNotFoundException("No context");
        String name = uri.getLastPathSegment();
        if (name == null || name.contains("..") || name.contains("/")) {{
            throw new FileNotFoundException("Invalid capture path");
        }}
        File dir = new File(getContext().getCacheDir(), "captures");
        if (!dir.exists()) {{
            dir.mkdirs();
        }}
        return new File(dir, name);
    }}

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {{
        File file = resolveFile(uri);
        int access = mode != null && mode.contains("w")
                ? ParcelFileDescriptor.MODE_READ_WRITE | ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE
                : ParcelFileDescriptor.MODE_READ_ONLY;
        return ParcelFileDescriptor.open(file, access);
    }}

    @Override
    public String getType(Uri uri) {{
        return "image/jpeg";
    }}

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {{
        MatrixCursor cursor = new MatrixCursor(new String[]{{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}});
        try {{
            File f = resolveFile(uri);
            cursor.addRow(new Object[]{{f.getName(), f.length()}});
        }} catch (Exception ignored) {{
        }}
        return cursor;
    }}

    @Override
    public Uri insert(Uri uri, ContentValues values) {{
        return null;
    }}

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {{
        return 0;
    }}

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {{
        return 0;
    }}
}}
'''


def main_activity_java(app: dict) -> str:
    pkg = app["package"]
    start_url = app["start_url"]
    label = app["label"]
    subtitle = app["subtitle"]
    return f'''package {pkg};

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {{
    private static final String START_URL = "{start_url}";
    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;
    private static final int PERMISSIONS_REQUEST_CODE = 1002;

    private WebView webView;
    private ProgressBar progressBar;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri pendingCameraUri;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {{
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {{
            getWindow().setStatusBarColor(Color.parseColor("#059669"));
        }}

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#F8FAFC"));

        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        FrameLayout.LayoutParams pbParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                8
        );
        progressBar.setLayoutParams(pbParams);
        progressBar.setIndeterminate(false);
        progressBar.setMax(100);
        progressBar.setVisibility(View.GONE);

        root.addView(webView);
        root.addView(progressBar);
        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " AerofiyAndroidAPK/1.0");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {{
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {{
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase() : "";
                String host = uri.getHost() != null ? uri.getHost().toLowerCase() : "";

                if (scheme.equals("tel") || scheme.equals("mailto") || scheme.equals("geo")
                        || scheme.equals("whatsapp")
                        || host.contains("maps.google.")
                        || (host.contains("google.com") && uri.getPath() != null && uri.getPath().startsWith("/maps"))) {{
                    try {{
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                        return true;
                    }} catch (Exception ignored) {{
                        return false;
                    }}
                }}
                return false;
            }}

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {{
                if (request != null && request.isForMainFrame()) {{
                    String offlineHtml = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'/>"
                            + "<style>body{{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center;}}"
                            + ".card{{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:24px;max-width:340px;width:100%;}}"
                            + "h2{{margin:0 0 8px;font-size:18px;color:#065f46;}}p{{margin:0 0 18px;font-size:13px;color:#475569;line-height:1.5;}}"
                            + "a{{display:inline-block;background:#059669;color:#fff;text-decoration:none;font-weight:600;font-size:13px;padding:10px 18px;border-radius:8px;}}</style></head>"
                            + "<body><div class='card'><h2>{label}</h2><p>{subtitle}</p>"
                            + "<p>Unable to reach <b>dms.aerofiy.com</b>. Check your internet connection and tap Retry.</p>"
                            + "<a href='" + START_URL + "'>Retry Connection</a></div></body></html>";
                    view.loadDataWithBaseURL(START_URL, offlineHtml, "text/html", "UTF-8", null);
                }}
            }}
        }});

        webView.setWebChromeClient(new WebChromeClient() {{
            @Override
            public void onProgressChanged(WebView view, int newProgress) {{
                if (newProgress < 100) {{
                    progressBar.setVisibility(View.VISIBLE);
                    progressBar.setProgress(newProgress);
                }} else {{
                    progressBar.setVisibility(View.GONE);
                }}
            }}

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {{
                callback.invoke(origin, true, false);
            }}

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {{
                if (filePathCallback != null) {{
                    filePathCallback.onReceiveValue(null);
                }}
                filePathCallback = callback;
                pendingCameraUri = null;

                List<Intent> extraIntents = new ArrayList<>();
                try {{
                    File capDir = new File(getCacheDir(), "captures");
                    if (!capDir.exists()) capDir.mkdirs();
                    String fileName = "grn_" + System.currentTimeMillis() + ".jpg";
                    File photoFile = new File(capDir, fileName);
                    photoFile.createNewFile();
                    pendingCameraUri = Uri.parse("content://{pkg}.captureprovider/" + fileName);

                    Intent cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, pendingCameraUri);
                    cameraIntent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    if (cameraIntent.resolveActivity(getPackageManager()) != null) {{
                        extraIntents.add(cameraIntent);
                    }}
                }} catch (Exception ignored) {{
                    pendingCameraUri = null;
                }}

                Intent contentIntent = new Intent(Intent.ACTION_GET_CONTENT);
                contentIntent.addCategory(Intent.CATEGORY_OPENABLE);
                contentIntent.setType("image/*");

                Intent chooser = Intent.createChooser(contentIntent, "Capture or Select Invoice Photo");
                if (!extraIntents.isEmpty()) {{
                    chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, extraIntents.toArray(new Intent[0]));
                }}
                try {{
                    startActivityForResult(chooser, FILE_CHOOSER_REQUEST_CODE);
                    return true;
                }} catch (Exception e) {{
                    filePathCallback = null;
                    return false;
                }}
            }}
        }});

        requestRuntimePermissions();

        if (savedInstanceState != null) {{
            webView.restoreState(savedInstanceState);
        }} else {{
            webView.loadUrl(START_URL);
        }}
    }}

    private void requestRuntimePermissions() {{
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        List<String> needed = new ArrayList<>();
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {{
            needed.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }}
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {{
            needed.add(Manifest.permission.CAMERA);
        }}
        if (!needed.isEmpty()) {{
            requestPermissions(needed.toArray(new String[0]), PERMISSIONS_REQUEST_CODE);
        }}
    }}

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {{
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {{
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK) {{
                if (data != null && data.getData() != null) {{
                    results = new Uri[]{{data.getData()}};
                }} else if (data != null && data.getClipData() != null) {{
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {{
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }}
                }} else if (pendingCameraUri != null) {{
                    results = new Uri[]{{pendingCameraUri}};
                }}
            }}
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
            return;
        }}
        super.onActivityResult(requestCode, resultCode, data);
    }}

    @Override
    protected void onSaveInstanceState(Bundle outState) {{
        super.onSaveInstanceState(outState);
        if (webView != null) {{
            webView.saveState(outState);
        }}
    }}

    @Override
    public void onBackPressed() {{
        if (webView != null && webView.canGoBack()) {{
            webView.goBack();
            return;
        }}
        super.onBackPressed();
    }}
}}
'''


def build_single_apk(app: dict):
    print(f"\n=== Building {app['filename']} ({app['package']}) ===", flush=True)
    app_dir = WORK_ROOT / app["package"]
    if app_dir.exists():
        shutil.rmtree(app_dir)
    app_dir.mkdir(parents=True, exist_ok=True)

    res_dir = app_dir / "res"
    src_dir = app_dir / "src" / Path(*app["package"].split("."))
    gen_dir = app_dir / "gen"
    obj_dir = app_dir / "obj"
    dex_dir = app_dir / "dex"
    for d in (res_dir, src_dir, gen_dir, obj_dir, dex_dir):
        d.mkdir(parents=True, exist_ok=True)

    generate_icons(res_dir)
    manifest_path = app_dir / "AndroidManifest.xml"
    manifest_path.write_text(manifest_xml(app), encoding="utf-8")

    (src_dir / "CaptureFileProvider.java").write_text(
        capture_provider_java(app["package"]), encoding="utf-8"
    )
    (src_dir / "MainActivity.java").write_text(main_activity_java(app), encoding="utf-8")

    compiled_res = app_dir / "compiled_res.zip"
    unaligned_apk = app_dir / "unaligned.apk"
    aligned_apk = app_dir / "aligned.apk"
    final_apk = PUBLIC_DIR / app["filename"]

    # 1. Compile Android resources with aapt2
    run([
        str(BUILD_TOOLS / "aapt2"), "compile",
        "--dir", str(res_dir),
        "-o", str(compiled_res),
    ])

    # 2. Link resources + AndroidManifest.xml into base APK and generate R.java
    run([
        str(BUILD_TOOLS / "aapt2"), "link",
        "-I", str(PLATFORM_JAR),
        "--manifest", str(manifest_path),
        "--java", str(gen_dir),
        "-o", str(unaligned_apk),
        str(compiled_res),
    ])

    # 3. Compile Java sources targeting Java 11 bytecode
    java_files = list(src_dir.glob("*.java")) + list(gen_dir.rglob("*.java"))
    run([
        "javac",
        "--release", "11",
        "-classpath", str(PLATFORM_JAR),
        "-d", str(obj_dir),
        *[str(f) for f in java_files],
    ])

    # 4. Convert .class files to Dalvik Executable (classes.dex) using d8
    class_files = list(obj_dir.rglob("*.class"))
    run([
        str(BUILD_TOOLS / "d8"),
        "--release",
        "--min-api", "24",
        "--lib", str(PLATFORM_JAR),
        "--output", str(dex_dir),
        *[str(f) for f in class_files],
    ])

    # 5. Add classes.dex into unaligned.apk
    run(["jar", "uf", str(unaligned_apk), "-C", str(dex_dir), "classes.dex"])

    # 6. Zipalign on 4-byte page boundaries (required on Android 11+)
    run([
        str(BUILD_TOOLS / "zipalign"), "-p", "-f", "4",
        str(unaligned_apk), str(aligned_apk),
    ])

    # 7. Sign APK (v1 + v2 + v3 signature schemes) using official apksigner
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    run([
        str(BUILD_TOOLS / "apksigner"), "sign",
        "--v4-signing-enabled", "false",
        "--ks", str(KEYSTORE_PATH),
        "--ks-key-alias", "aerofiy",
        "--ks-pass", "pass:aerofiy2026",
        "--key-pass", "pass:aerofiy2026",
        "--out", str(final_apk),
        str(aligned_apk),
    ])

    # 8. Verify APK signature integrity
    run([str(BUILD_TOOLS / "apksigner"), "verify", "--print-certs", str(final_apk)])

    # 9. Also mirror into cpanel-deploy/
    CPANEL_DEPLOY_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(final_apk, CPANEL_DEPLOY_DIR / app["filename"])

    size_kb = final_apk.stat().st_size / 1024
    print(f"SUCCESS: {final_apk.name} ({size_kb:.1f} KB)", flush=True)


def main():
    if not (BUILD_TOOLS / "aapt2").exists() or not PLATFORM_JAR.exists():
        print("Android SDK build-tools;34.0.0 and platforms;android-34 must be installed in /tmp/android-sdk", file=sys.stderr)
        sys.exit(1)

    ensure_keystore()
    for app in APPS:
        build_single_apk(app)
    print("\nAll signed Android APKs built and verified successfully!")


if __name__ == "__main__":
    main()
