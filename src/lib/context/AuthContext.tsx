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
import type { AccountRole, AccountTier, EntitlementStatus } from '@/lib/supabase/serverAuth';

export interface AuthUserSummary {
  id: string;
  email: string;
  displayName: string | null;
  role: AccountRole;
  tier: AccountTier;
  storedTier?: AccountTier;
  tierExpiresAt: string | null;
  pendingTier?: 'pro' | 'premium' | null;
  pendingTierEffectiveAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  isExpired: boolean;
  isAdmin: boolean;
  entitlementStatus: EntitlementStatus;
  hasModelAccess: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialDaysRemaining: number;
  emailConfirmed: boolean;
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
          storedTier: json.profile.storedTier || json.profile.tier || 'free',
          tierExpiresAt: json.profile.tierExpiresAt || null,
          pendingTier: json.profile.pendingTier || null,
          pendingTierEffectiveAt: json.profile.pendingTierEffectiveAt || null,
          cancelAtPeriodEnd: Boolean(json.profile.cancelAtPeriodEnd),
          isExpired: Boolean(json.profile.isExpired),
          isAdmin: Boolean(json.profile.isAdmin),
          entitlementStatus: json.profile.entitlementStatus || (json.profile.isAdmin ? 'admin' : json.profile.isExpired ? 'expired' : 'trial'),
          hasModelAccess: json.profile.hasModelAccess !== undefined ? Boolean(json.profile.hasModelAccess) : !json.profile.isExpired,
          trialStartedAt: json.profile.trialStartedAt || null,
          trialEndsAt: json.profile.trialEndsAt || null,
          trialDaysRemaining: Number(json.profile.trialDaysRemaining) || 0,
          emailConfirmed: json.profile.emailConfirmed !== false,
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
