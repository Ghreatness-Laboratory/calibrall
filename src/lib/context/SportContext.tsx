'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Sport } from '@/types';

interface SportContextType {
  sport: Sport;
  setSport: (newSport: Sport) => void;
  isSwitching: boolean;
}

const SportContext = createContext<SportContextType>({
  sport: 'football',
  setSport: () => {},
  isSwitching: false,
});

const STORAGE_KEY = 'matchmind_selected_sport';

function SportContextProviderInner({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [sport, setSportState] = useState<Sport>('football');
  const [isSwitching, setIsSwitching] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // Initialize sport from URL or localStorage
  useEffect(() => {
    let initialSport: Sport = 'football';

    // 1. Check URL query param
    const param = searchParams.get('sport')?.toLowerCase();
    if (param === 'basketball' || param === 'football') {
      initialSport = param as Sport;
    } else {
      // 2. Check localStorage
      try {
        const stored = localStorage.getItem(STORAGE_KEY)?.toLowerCase();
        if (stored === 'basketball' || stored === 'football') {
          initialSport = stored as Sport;
        }
      } catch {
        // Safe fallback
      }
    }

    setSportState(initialSport);
    setIsInitialized(true);
  }, [searchParams]);

  const setSport = useCallback((newSport: Sport) => {
    if (newSport === sport) return;

    setIsSwitching(true);
    setSportState(newSport);

    // Save to localStorage
    try {
      localStorage.setItem(STORAGE_KEY, newSport);
    } catch {
      // Safe fallback
    }

    // Update URL param without full page reload
    const currentParams = new URLSearchParams(Array.from(searchParams.entries()));
    currentParams.set('sport', newSport);
    const newUrl = `${pathname}?${currentParams.toString()}`;
    router.replace(newUrl, { scroll: false });

    // Reset switching state after brief transition to show smooth skeleton
    setTimeout(() => {
      setIsSwitching(false);
    }, 280);
  }, [sport, searchParams, pathname, router]);

  return (
    <SportContext.Provider value={{ sport, setSport, isSwitching }}>
      {children}
    </SportContext.Provider>
  );
}

export function SportProvider({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<>{children}</>}>
      <SportContextProviderInner>{children}</SportContextProviderInner>
    </Suspense>
  );
}

export function useSport() {
  return useContext(SportContext);
}
