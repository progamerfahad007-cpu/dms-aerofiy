import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

const CPANEL_ZIP_NAME = 'dms-aerofiy-com-cpanel.zip';
const ANDROID_APP_ZIP_NAME = 'aerofiy-field-android-app.zip';

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function collectFiles(
  rootDir: string,
  currentDir = rootDir
): {relPath: string; fullPath: string}[] {
  const entries = fs.readdirSync(currentDir, {withFileTypes: true});
  const out: {relPath: string; fullPath: string}[] = [];
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    const relPath = path.relative(rootDir, fullPath).split(path.sep).join('/');
    if (entry.isDirectory()) {
      out.push(...collectFiles(rootDir, fullPath));
    } else if (entry.name !== CPANEL_ZIP_NAME) {
      out.push({relPath, fullPath});
    }
  }
  return out;
}

function createZipBuffer(files: {relPath: string; data: Buffer}[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  for (const file of files) {
    const nameBuf = Buffer.from(file.relPath, 'utf8');
    const uncompressed = file.data;
    const compressed = zlib.deflateRawSync(uncompressed, {level: 9});
    const crc = crc32(uncompressed);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(uncompressed.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

function buildAndroidFieldProjectZip(rootDir: string): Buffer {
  const pkgJson = JSON.stringify(
    {
      name: 'aerofiy-field-android',
      version: '1.0.0',
      description: 'aerofiy Field Android App (Salesman & Deliveryman Only) for dms.aerofiy.com',
      scripts: {
        'sync:android': 'npx cap add android || true && npx cap sync android',
        'open:android': 'npx cap open android',
      },
      dependencies: {
        '@capacitor/android': '^6.1.0',
        '@capacitor/core': '^6.1.0',
      },
      devDependencies: {
        '@capacitor/cli': '^6.1.0',
      },
    },
    null,
    2
  );

  const capacitorConfig = JSON.stringify(
    {
      appId: 'com.aerofiy.field',
      appName: 'aerofiy Field',
      webDir: 'www',
      server: {
        url: 'https://dms.aerofiy.com/?app=field',
        cleartext: false,
      },
      android: {
        allowMixedContent: false,
      },
    },
    null,
    2
  );

  const fallbackHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>aerofiy Field — Sales & Delivery</title>
  <meta http-equiv="refresh" content="0;url=https://dms.aerofiy.com/?app=field" />
</head>
<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc;color:#0f172a;text-align:center;padding:24px;">
  <div>
    <h1 style="margin:0 0 8px;font-size:20px;">aerofiy Field App</h1>
    <p style="margin:0 0 16px;font-size:13px;color:#475569;">Connecting to https://dms.aerofiy.com/?app=field (Salesman &amp; Deliveryman Only)...</p>
    <a href="https://dms.aerofiy.com/?app=field" style="display:inline-block;padding:10px 16px;background:#059669;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">Open aerofiy Field</a>
  </div>
</body>
</html>
`;

  const guideTxt = `aerofiy Field — Android App (Salesman & Deliveryman Only)
=========================================================
Live Field URL: https://dms.aerofiy.com/?app=field
Restricted Roles: Sales Representatives & Deliverymen ONLY.

OPTION 1 — Instant Install on Android Phones (Recommended, No APK Build Required)
1. Upload & extract dms-aerofiy-com-cpanel.zip to your https://dms.aerofiy.com cPanel subdomain root.
2. Enable HTTPS (AutoSSL) in cPanel.
3. Have each Salesman or Deliveryman open https://dms.aerofiy.com/?app=field in Chrome on Android,
   or sign in to their portal and tap "Install Android App".
4. Android installs "aerofiyField" directly onto their Home Screen & App Drawer as a standalone app.

OPTION 2 — Build a Signed Android APK (.apk) with Capacitor & Android Studio
Prerequisites: Node.js 18+ and Android Studio installed on your computer.
1. Extract this ZIP (aerofiy-field-android-app.zip) into a folder.
2. Run:
     npm install
     npm run sync:android
     npm run open:android
3. In Android Studio, choose: Build -> Build Bundle(s) / APK(s) -> Build APK(s).
4. Share the resulting app-debug.apk or signed app-release.apk with your Salesmen & Deliverymen.
   Note: Add android.permission.ACCESS_FINE_LOCATION and android.permission.CAMERA in
   android/app/src/main/AndroidManifest.xml for GPS store tagging & photo capture.
`;

  const entries: {relPath: string; data: Buffer}[] = [
    {relPath: 'package.json', data: Buffer.from(pkgJson, 'utf8')},
    {relPath: 'capacitor.config.json', data: Buffer.from(capacitorConfig, 'utf8')},
    {relPath: 'www/index.html', data: Buffer.from(fallbackHtml, 'utf8')},
    {relPath: 'README-ANDROID-APK-BUILD.txt', data: Buffer.from(guideTxt, 'utf8')},
  ];

  const iconPath = path.join(rootDir, 'public', 'pwa-512x512.png');
  if (fs.existsSync(iconPath)) {
    entries.push({relPath: 'assets/icon-512.png', data: fs.readFileSync(iconPath)});
  }

  return createZipBuffer(entries);
}

export default defineConfig(({command}) => {
  return {
    base: command === 'build' ? './' : '/',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: '/?app=field',
          name: 'aerofiy Field — Sales & Delivery',
          short_name: 'aerofiyField',
          description:
            'Android Field App for aerofiy DMS Sales Representatives and Deliverymen.',
          theme_color: '#059669',
          background_color: '#f8fafc',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/?app=field',
          scope: '/',
          icons: [
            {
              src: './pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          globIgnores: ['**/*.zip', '**/*.apk'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
      // Packages clean cPanel ZIP for dms.aerofiy.com + Android Field App ZIP inside dist/
      // (so no large build folders clutter the workspace root or slow down GitHub sync)
      // and serves downloadable ZIPs & APKs in dev mode.
      {
        name: 'cpanel-dms-aerofiy-packager',
        enforce: 'post',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const urlPath = req.url ? req.url.split('?')[0] : '';
            if (urlPath === `/${CPANEL_ZIP_NAME}` || urlPath === `/${ANDROID_APP_ZIP_NAME}`) {
              const targetName = urlPath.slice(1);
              const zipPath = path.resolve(__dirname, 'dist', targetName);
              if (fs.existsSync(zipPath)) {
                const stat = fs.statSync(zipPath);
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/zip');
                res.setHeader('Content-Length', String(stat.size));
                res.setHeader('Content-Disposition', `attachment; filename="${targetName}"`);
                fs.createReadStream(zipPath).pipe(res);
                return;
              }
            }
            if (urlPath.endsWith('.apk')) {
              const targetName = path.basename(urlPath);
              const apkPath = path.resolve(__dirname, 'public', targetName);
              if (fs.existsSync(apkPath)) {
                const stat = fs.statSync(apkPath);
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/vnd.android.package-archive');
                res.setHeader('Content-Length', String(stat.size));
                res.setHeader('Content-Disposition', `attachment; filename="${targetName}"`);
                fs.createReadStream(apkPath).pipe(res);
                return;
              }
            }
            next();
          });
        },
        closeBundle: {
          order: 'post',
          sequential: true,
          handler(error?: Error): void {
            if (error) {
              return;
            }
            const distDir = path.resolve(__dirname, 'dist');
            if (!fs.existsSync(distDir)) return;

            // 1. Build Android Field App Capacitor wrapper ZIP into dist/
            const androidZipBuf = buildAndroidFieldProjectZip(__dirname);
            fs.writeFileSync(path.join(distDir, ANDROID_APP_ZIP_NAME), androidZipBuf);

            // 2. Package all dist/ files (PWA manifest, sw.js, workbox, icons, .htaccess,
            //    signed .apk files, and Android wrapper ZIP) into dist/dms-aerofiy-com-cpanel.zip
            const collected = collectFiles(distDir);
            const zipEntries: {relPath: string; data: Buffer}[] = collected.map((item) => ({
              relPath: item.relPath,
              data: fs.readFileSync(item.fullPath),
            }));

            const zipBuffer = createZipBuffer(zipEntries);
            fs.writeFileSync(path.join(distDir, CPANEL_ZIP_NAME), zipBuffer);
          },
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
