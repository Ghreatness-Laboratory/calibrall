'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface InstallPromptContextType {
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  canShowButton: boolean;
  showIOSSheet: boolean;
  setShowIOSSheet: (show: boolean) => void;
  promptInstall: () => Promise<boolean>;
  isBannerVisible: boolean;
  dismissBanner: () => void;
  waitingWorker: ServiceWorker | null;
  applyUpdate: () => void;
  isOffline: boolean;
}

const InstallPromptContext = createContext<InstallPromptContextType | null>(null);

const BANNER_DISMISSED_KEY = 'calibrall_pwa_banner_dismissed_until';
const VISIT_COUNT_KEY = 'calibrall_visit_count';

export function InstallPromptProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSSheet, setShowIOSSheet] = useState(false);
  const [isBannerVisible, setIsBannerVisible] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  // 1. Initial environment detection & Service Worker registration
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Detect standalone mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    // Detect iOS Safari (not standalone)
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOSDevice =
      /iphone|ipad|ipod/.test(ua) &&
      !window.matchMedia('(display-mode: standalone)').matches &&
      !(window.navigator as unknown as { standalone?: boolean }).standalone;
    // Check if Safari on iOS (WebKit without Chrome/CriOS)
    const isIOSSafari = isIOSDevice && !ua.includes('crios') && !ua.includes('fxios');
    setIsIOS(isIOSSafari);

    // Track online/offline status
    setIsOffline(!window.navigator.onLine);
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Register service worker only in true production or when explicitly requested via ?sw=1
    const handleServiceWorker = () => {
      if (!('serviceWorker' in navigator)) return;

      const isExplicitProd = process.env.NODE_ENV === 'production' && !window.location.hostname.includes('ais-dev');
      const isManualTest = window.location.search.includes('sw=1');

      if (isExplicitProd || isManualTest) {
        navigator.serviceWorker
          .register('/sw.js', { scope: '/' })
          .then((registration) => {
            // Check if there is already a waiting worker
            if (registration.waiting) {
              setWaitingWorker(registration.waiting);
            }

            // Listen for newly installed workers that enter waiting state
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    setWaitingWorker(newWorker);
                  }
                });
              }
            });
          })
          .catch((err) => {
            console.debug('[SW] Registration notice:', err);
          });

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!refreshing) {
            refreshing = true;
            window.location.reload();
          }
        });
      } else {
        // In development / preview: proactively unregister any previously registered service worker
        // to prevent stale chunk caching and Unexpected token '<' errors
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const reg of registrations) {
            reg.unregister().catch(() => {});
          }
        }).catch(() => {});

        if ('caches' in window) {
          caches.keys().then((keys) => {
            for (const key of keys) {
              if (key.startsWith('calibrall-')) {
                caches.delete(key).catch(() => {});
              }
            }
          }).catch(() => {});
        }
      }
    };

    if (document.readyState === 'complete') {
      handleServiceWorker();
    } else {
      window.addEventListener('load', handleServiceWorker);
    }

    // 2. Listen for beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setIsBannerVisible(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('load', registerSW);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // 3. Mobile banner display conditions:
  // - shown once, near bottom above bottom nav (mobile only)
  // - after the user's second visit OR after 20 seconds on site
  // - dismissed suppresses for 14 days
  // - never shown in standalone mode
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isInstalled) return;

    // Check if dismissed within 14 days
    const dismissedUntil = localStorage.getItem(BANNER_DISMISSED_KEY);
    if (dismissedUntil && Number(dismissedUntil) > Date.now()) {
      return;
    }

    // Check visit count
    const visits = Number(localStorage.getItem(VISIT_COUNT_KEY) || '0') + 1;
    localStorage.setItem(VISIT_COUNT_KEY, String(visits));

    const showBanner = () => {
      // Recheck standalone and dismissed state
      const isStandaloneNow =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      if (!isStandaloneNow) {
        setIsBannerVisible(true);
      }
    };

    if (visits >= 2) {
      // Show immediately on 2nd+ visit if installable or iOS
      const timer = setTimeout(showBanner, 2500);
      return () => clearTimeout(timer);
    } else {
      // Show after 20 seconds on first visit
      const timer = setTimeout(showBanner, 20000);
      return () => clearTimeout(timer);
    }
  }, [isInstalled]);

  // 4. Trigger install prompt
  const promptInstall = useCallback(async () => {
    if (isInstalled) return false;

    if (isIOS) {
      setShowIOSSheet(true);
      return true;
    }

    if (!deferredPrompt) {
      return false;
    }

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        setIsBannerVisible(false);
        return true;
      } else {
        // Dismissed by user: suppress banner for 14 days
        const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
        localStorage.setItem(BANNER_DISMISSED_KEY, String(Date.now() + fourteenDaysMs));
        setIsBannerVisible(false);
        return false;
      }
    } catch (err) {
      console.error('[PWA] Prompt error:', err);
      return false;
    }
  }, [deferredPrompt, isInstalled, isIOS]);

  const dismissBanner = useCallback(() => {
    setIsBannerVisible(false);
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    localStorage.setItem(BANNER_DISMISSED_KEY, String(Date.now() + fourteenDaysMs));
  }, []);

  const applyUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  }, [waitingWorker]);

  const canShowButton = !isInstalled && (!!deferredPrompt || isIOS);

  return (
    <InstallPromptContext.Provider
      value={{
        isInstallable: !!deferredPrompt,
        isInstalled,
        isIOS,
        canShowButton,
        showIOSSheet,
        setShowIOSSheet,
        promptInstall,
        isBannerVisible: isBannerVisible && canShowButton,
        dismissBanner,
        waitingWorker,
        applyUpdate,
        isOffline,
      }}
    >
      {children}
    </InstallPromptContext.Provider>
  );
}

export function useInstallPrompt() {
  const context = useContext(InstallPromptContext);
  if (!context) {
    throw new Error('useInstallPrompt must be used within an InstallPromptProvider');
  }
  return context;
}
