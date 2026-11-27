import type { Metadata, Viewport } from 'next';
import { DM_Sans, Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';
import { InstallPromptProvider } from '@/components/pwa/InstallPromptProvider';
import MobileInstallBanner from '@/components/pwa/MobileInstallBanner';
import IOSInstallModal from '@/components/pwa/IOSInstallModal';
import SWUpdateToast from '@/components/pwa/SWUpdateToast';
import OfflineBanner from '@/components/pwa/OfflineBanner';
import TopSportBar from '@/components/TopSportBar';
import { SportProvider } from '@/lib/context/SportContext';
import { AuthProvider, type AuthUserSummary } from '@/lib/context/AuthContext';
import { getServerAuthSession, getServerSupabaseConfig } from '@/lib/supabase/serverAuth';
import { maybeSendTrialReminderEmail } from '@/lib/notifications/trialReminders';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F6F5' },
    { media: '(prefers-color-scheme: dark)', color: '#0A0E0D' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'Calibrall | Every call, on record.',
  description:
    'Start your 7-day free trial. Probabilistic football and basketball predictions where every pick is timestamped before kickoff and scored after full time.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Calibrall',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'Calibrall | Every call, on record.',
    description:
      'Start your 7-day free trial. Probabilistic football and basketball predictions where every pick is timestamped before kickoff and scored after full time.',
    type: 'website',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuthSession();
  const { isAuthConfigured } = getServerSupabaseConfig();
  if (session) {
    void maybeSendTrialReminderEmail(session).catch(() => {});
  }

  const initialUser: AuthUserSummary | null = session
    ? {
        id: session.user.id,
        email: session.user.email,
        displayName: session.profile.displayName,
        role: session.profile.role,
        tier: session.effectiveTier,
        tierExpiresAt: session.profile.tierExpiresAt,
        isExpired: session.isExpired,
        isAdmin: session.isAdmin,
        entitlementStatus: session.entitlements.status,
        hasModelAccess: session.entitlements.hasModelAccess,
        trialStartedAt: session.entitlements.trialStartedAt,
        trialEndsAt: session.entitlements.trialEndsAt,
        trialDaysRemaining: session.entitlements.trialDaysRemaining,
        emailConfirmed: session.entitlements.emailConfirmed,
        createdAt: session.profile.createdAt,
      }
    : null;

  return (
    <html lang="en" className={`${dmSans.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Calibrall" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('calibrall_monochrome_mode')==='true'){document.documentElement.classList.add('monochrome')}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-[100dvh] bg-[var(--bg)] text-[var(--text)] flex flex-col antialiased selection:bg-[var(--accent-fill)] selection:text-[#0A0E0D]">
        <AuthProvider
          initialUser={initialUser}
          isSupabaseAuthConfigured={isAuthConfigured}
        >
          <InstallPromptProvider>
            <SportProvider>
              <Navbar />
              <main
                className="flex-1 max-w-[430px] md:max-w-4xl lg:max-w-7xl w-full mx-auto px-4 pb-[calc(78px+env(safe-area-inset-bottom,0px))] md:pb-8 min-w-0"
                style={{
                  paddingTop: 'calc(var(--app-header-offset, calc(56px + env(safe-area-inset-top, 0px))) + 16px)',
                }}
              >
                <OfflineBanner />
                <TopSportBar />
                {children}
              </main>
              <Footer />
              <BottomNav />
              <MobileInstallBanner />
              <IOSInstallModal />
              <SWUpdateToast />
            </SportProvider>
          </InstallPromptProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
