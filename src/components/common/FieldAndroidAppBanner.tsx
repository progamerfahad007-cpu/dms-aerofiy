import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../../hooks/usePWAInstall';

interface FieldAndroidAppBannerProps {
  roleLabel: 'Salesman' | 'Deliveryman' | 'Distribution Manager';
}

const APK_BY_ROLE: Record<
  FieldAndroidAppBannerProps['roleLabel'],
  { filename: string; appName: string; buttonLabel: string; description: string }
> = {
  Salesman: {
    filename: 'aerofiy-salesman-app.apk',
    appName: 'aerofiy Salesman',
    buttonLabel: 'Download Salesman APK (.apk)',
    description:
      'Install the signed Android APK directly on your phone for GPS store tagging, retail order booking, and real-time sync with dms.aerofiy.com.',
  },
  'Distribution Manager': {
    filename: 'aerofiy-distribution-manager-app.apk',
    appName: 'aerofiy Distribution',
    buttonLabel: 'Download Distribution Manager APK (.apk)',
    description:
      'Install the signed Android APK on your phone for GRN invoice camera uploads, stock dispatch, route reconciliation, and live stock queries.',
  },
  Deliveryman: {
    filename: 'aerofiy-field-app.apk',
    appName: 'aerofiy Field',
    buttonLabel: 'Download Android APK (.apk)',
    description:
      'Install the signed Android APK on your phone for route navigation, delivery completion, return handling, and real-time cash sync.',
  },
};

export const FieldAndroidAppBanner: React.FC<FieldAndroidAppBannerProps> = ({ roleLabel }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // Automatically suppress install banner when already running inside the installed Android APK/PWA
  if (isInstalled) {
    return null;
  }

  const apkInfo = APK_BY_ROLE[roleLabel];

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <div className="mb-5 bg-emerald-950 text-white border border-emerald-800 rounded-xl px-4 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-wide text-emerald-300 uppercase">
              Android Mobile App (.apk) · {roleLabel}
            </p>
            <p className="text-xs text-emerald-50/90 mt-0.5">{apkInfo.description}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href={`./${apkInfo.filename}`}
            download={apkInfo.filename}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {apkInfo.buttonLabel}
          </a>

          <button
            type="button"
            onClick={handleInstallClick}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-700 border border-emerald-700 rounded-lg transition-colors cursor-pointer"
          >
            <Smartphone className="w-3.5 h-3.5" />
            {isInstallable ? 'Quick Web Install' : 'Install Instructions'}
          </button>
        </div>
      </div>

      {showGuide && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Install {apkInfo.appName} (.apk) on Android
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-700">
              {isIOS ? (
                <div className="space-y-2">
                  <p className="font-semibold text-slate-900">Install on iPhone / iPad (Safari):</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-600">
                    <li>
                      Open <span className="font-mono text-slate-900">https://dms.aerofiy.com/?app=field</span> in Safari.
                    </li>
                    <li>
                      Tap the <strong>Share</strong> icon in the bottom Safari toolbar.
                    </li>
                    <li>
                      Scroll down and tap <strong>Add to Home Screen</strong>, then tap{' '}
                      <strong>Add</strong>.
                    </li>
                  </ol>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="font-semibold text-slate-900">
                    Install the Signed Android APK on your phone:
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-600">
                    <li>
                      Tap <strong>{apkInfo.buttonLabel}</strong> below to download{' '}
                      <span className="font-mono text-slate-900">{apkInfo.filename}</span>.
                    </li>
                    <li>
                      Open the downloaded <span className="font-mono">.apk</span> file from your
                      Downloads notification or Files app.
                    </li>
                    <li>
                      If prompted, tap <strong>Settings → Allow from this source</strong>, then tap{' '}
                      <strong>Install</strong>.
                    </li>
                    <li>
                      Allow <strong>Location (GPS)</strong> and <strong>Camera</strong> permissions
                      on first launch for store tagging and GRN invoice capture.
                    </li>
                  </ol>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex flex-wrap gap-2">
                <a
                  href={`./${apkInfo.filename}`}
                  download={apkInfo.filename}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download {apkInfo.filename}
                </a>
                <a
                  href="./aerofiy-field-app.apk"
                  download="aerofiy-field-app.apk"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  <Download className="w-3.5 h-3.5" />
                  All-in-One Field APK
                </a>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      Offline Mode — Cached field data is active.
    </div>
  );
};
