'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient, isBrowserSupabaseConfigured } from '@/lib/supabase/browser';
import { clearAllClientUserCaches } from '@/lib/storage/userStorage';
import type { AccountRole, AccountTier } from '@/lib/supabase/serverAuth';

export interface AuthUserSummary {
  id: string;
  email: string;
  displayName: string | null;
  role: AccountRole;
  tier: AccountTier;
  tierExpiresAt: string | null;
  isExpired: boolean;
  isAdmin: boolean;
  createdAt: string;
}

interface AuthContextValue {
  user: AuthUserSummary | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  isSupabaseAuthConfigured: boolean;
  refreshProfile: () => Promise<AuthUserSummary | null>;
  signOutAndClearCaches: (redirectTo?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  initialUser,
  isSupabaseAuthConfigured,
  children,
}: {
  initialUser: AuthUserSummary | null;
  isSupabaseAuthConfigured: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUserSummary | null>(initialUser);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const refreshProfile = useCallback(async (): Promise<AuthUserSummary | null> => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/account', { cache: 'no-store' });
      if (!res.ok) {
        setUser(null);
        return null;
      }
      const json = await res.json();
      if (json?.profile) {
        const nextUser: AuthUserSummary = {
          id: String(json.profile.id),
          email: String(json.profile.email || json.user?.email || ''),
          displayName: json.profile.displayName || null,
          role: json.profile.role === 'admin' ? 'admin' : 'user',
          tier: json.profile.tier || 'free',
          tierExpiresAt: json.profile.tierExpiresAt || null,
          isExpired: Boolean(json.profile.isExpired),
          isAdmin: Boolean(json.profile.isAdmin),
          createdAt: String(json.profile.createdAt || ''),
        };
        setUser(nextUser);
        return nextUser;
      }
      setUser(null);
      return null;
    } catch {
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  useEffect(() => {
    if (!isBrowserSupabaseConfigured()) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        await clearAllClientUserCaches();
      } else if (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        await refreshProfile();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshProfile]);

  const signOutAndClearCaches = useCallback(
    async (redirectTo: string = '/login') => {
      try {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await supabase.auth.signOut().catch(() => {});
        }
        await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' }).catch(() => {});
      } finally {
        await clearAllClientUserCaches();
        setUser(null);
        router.push(redirectTo);
        router.refresh();
      }
    },
    [router]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isAdmin: Boolean(user?.isAdmin),
        isLoading,
        isSupabaseAuthConfigured,
        refreshProfile,
        signOutAndClearCaches,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
