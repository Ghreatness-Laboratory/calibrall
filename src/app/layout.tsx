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
  title: 'Calibrall | Football & NBA Basketball Statistical Projection Platform',
  description: 'Football & NBA Basketball Statistical Projection Platform. Bivariate Poisson models, exact NBA possession efficiency projections, and calibrated multi market analytics.',
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
    title: 'Calibrall | Football & NBA Basketball Statistical Projection Platform',
    description: 'Football & NBA Basketball Statistical Projection Platform. Bivariate Poisson models, exact NBA possession efficiency projections, and calibrated multi market analytics.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
        <InstallPromptProvider>
          <SportProvider>
            <Navbar />
            <OfflineBanner />
            <main className="flex-1 max-w-[430px] md:max-w-4xl lg:max-w-7xl w-full mx-auto px-4 pt-3 pb-[calc(78px+env(safe-area-inset-bottom,0px))] md:pb-8 min-w-0">
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
      </body>
    </html>
  );
}
