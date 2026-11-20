aerofiy DMS — cPanel Deployment Guide for dms.aerofiy.com
=========================================================

Files included in this package (copy/paste all into your subdomain root):
- index.html
- .htaccess (SPA routing + MIME types for .apk, .zip, .webmanifest)
- favicon.svg, pwa-*.png, sw.js, workbox-*.js
- assets/ (compiled JavaScript & CSS bundles with real-time cloud sync)
- aerofiy-salesman-app.apk (Signed Android APK for Sales Representatives)
- aerofiy-distribution-manager-app.apk (Signed Android APK for Distribution / Warehouse Managers & Deliverymen)
- aerofiy-field-app.apk (Signed Combined Android APK for Salesman, Distribution Manager & Deliveryman)

Quick cPanel Installation Steps:
1. Log into cPanel -> Domains -> Create A New Domain.
   - Domain: dms.aerofiy.com
   - UNCHECK "Share document root" so it uses its own folder (e.g. /home/username/dms.aerofiy.com).
   - Click Submit.
2. Open cPanel -> File Manager and go to the dms.aerofiy.com document root folder.
3. Click Upload -> select dms-aerofiy-com-cpanel.zip -> right-click it -> Extract.
   Note: Enable "Show Hidden Files (dotfiles)" in File Manager Settings if you want to verify .htaccess.
4. Go to cPanel -> SSL/TLS Status -> Run AutoSSL for dms.aerofiy.com so HTTPS is issued.
   Then in cPanel -> Domains, turn ON "Force HTTPS Redirect" for dms.aerofiy.com
   (HTTPS is required for GPS location capture and Android APK WebView connections).
5. Open https://dms.aerofiy.com in your browser.
   Default Admin Login -> Username: Admin | Password: 1234
   (Change your Admin password and update Company Branding under Security & Settings.)

Direct Android APK Download Links (once uploaded to dms.aerofiy.com):
- Salesman App:             https://dms.aerofiy.com/aerofiy-salesman-app.apk
- Distribution Manager App: https://dms.aerofiy.com/aerofiy-distribution-manager-app.apk
- Combined Field App:       https://dms.aerofiy.com/aerofiy-field-app.apk
