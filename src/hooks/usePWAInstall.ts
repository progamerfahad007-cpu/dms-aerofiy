import { useEffect, useState } from 'react';
import { UserRole } from '../types/dms';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type MobileAppMode = 'web' | 'field' | 'salesman' | 'distribution';

export function detectMobileAppMode(): MobileAppMode {
  if (typeof window === 'undefined') return 'web';
  const params = new URLSearchParams(window.location.search);
  const queryApp = (params.get('app') || '').toLowerCase();
  if (queryApp === 'salesman') return 'salesman';
  if (queryApp === 'distribution') return 'distribution';
  if (queryApp === 'field') return 'field';

  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  if (isStandalone) return 'field';

  return 'web';
}

export function getAllowedRolesForMode(mode: MobileAppMode): UserRole[] | undefined {
  switch (mode) {
    case 'salesman':
      return ['SALES_REP'];
    case 'distribution':
      return ['WAREHOUSE_MANAGER', 'DELIVERYMAN'];
    case 'field':
      return ['SALES_REP', 'DELIVERYMAN', 'WAREHOUSE_MANAGER'];
    default:
      return undefined;
  }
}

export function detectFieldAppMode(): boolean {
  return detectMobileAppMode() !== 'web';
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [appMode, setAppMode] = useState<MobileAppMode>(() => detectMobileAppMode());

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const isApkWebView = /AerofiyAndroidAPK/i.test(window.navigator.userAgent);
    setIsInstalled(isStandalone || isApkWebView);
    setAppMode(detectMobileAppMode());

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));
    setIsAndroid(/android/.test(ua));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  const isFieldAppMode = appMode !== 'web';
  const allowedRoles = getAllowedRolesForMode(appMode);

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    isAndroid,
    appMode,
    isFieldAppMode,
    allowedRoles,
    install,
  };
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
