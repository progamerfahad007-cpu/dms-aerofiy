# Auto-Deploy aerofiy DMS (`dms.aerofiy.com`) from GitHub to cPanel

This project includes a ready-to-use GitHub Actions workflow (`.github/workflows/deploy-cpanel.yml`) so every time you make updates in AI Studio and push to GitHub, **`https://dms.aerofiy.com` updates automatically in ~1 minute**—with **zero impact on your live Firebase Firestore database** and **no need for staff to reinstall the Android `.apk` apps**.

---

## One-Time Setup (Takes ~3 Minutes)

### Step 1: Connect this Project to GitHub
1. Click the **GitHub** export/sync icon at the top of AI Studio and push this project to a **private** GitHub repository (for example, `aerofiy-dms`).

### Step 2: Create a Dedicated cPanel FTP Account for `dms.aerofiy.com`
1. Log into your **cPanel** dashboard.
2. Open **Files → FTP Accounts**.
3. Create a new FTP user:
   - **Log In**: `dmsdeploy` (full username will look like `dmsdeploy@aerofiy.com`)
   - **Password**: Generate a strong password and copy it.
   - **Directory**: Set this to the exact document root folder of your subdomain (e.g. `dms.aerofiy.com` or `public_html/dms.aerofiy.com` — match what is shown in **cPanel → Domains**).
   - **Quota**: Unlimited.
4. Click **Create FTP Account**.

### Step 3: Add Your FTP Secrets to GitHub
1. Open your GitHub repository → click **Settings** → **Secrets and variables** → **Actions**.
2. Click **New repository secret** and add these secrets:

| Secret Name | Value to Enter |
|---|---|
| `CPANEL_FTP_SERVER` | Your FTP host (usually `ftp.aerofiy.com` or your cPanel server IP) |
| `CPANEL_FTP_USERNAME` | Full FTP username (e.g., `dmsdeploy@aerofiy.com`) |
| `CPANEL_FTP_PASSWORD` | The FTP password you created in Step 2 |
| `CPANEL_FTP_SERVER_DIR` | `./` *(recommended when the FTP user's directory is already set to `dms.aerofiy.com`; otherwise `/dms.aerofiy.com/`)* |

> **Tip**: If your hosting provider does not support `ftps` on port 21 (you see a TLS error in GitHub Actions logs), edit `.github/workflows/deploy-cpanel.yml` and change `protocol: ftps` to `protocol: ftp`.

### Step 4: Test Automatic Deployment
1. In GitHub, open the **Actions** tab.
2. Click **Auto-Deploy aerofiy DMS to cPanel (dms.aerofiy.com)** → click **Run workflow** (or simply push any edit from AI Studio).
3. Watch the green checkmark complete — it compiles the latest app, preserves your `.well-known/` AutoSSL folder, uploads `index.html`, `.htaccess`, `assets/`, `sw.js`, and all three signed `.apk` files straight to `dms.aerofiy.com`.

---

## Day-to-Day Update Workflow After Setup
1. Ask for any feature, report, or UI change here in this chat.
2. Click **Push / Sync to GitHub**.
3. Wait ~60 seconds — `https://dms.aerofiy.com` updates live automatically!
4. All live **Firebase Firestore data** (users, stock, orders, GRN photos, invoices, cashbook) remains **100% untouched**, and Android `.apk` users receive the update automatically next time they open the app.
