import type { Metadata, Viewport } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';
import { InstallPromptProvider } from '@/components/pwa/InstallPromptProvider';
import MobileInstallBanner from '@/components/pwa/MobileInstallBanner';
import IOSInstallModal from '@/components/pwa/IOSInstallModal';
import SWUpdateToast from '@/components/pwa/SWUpdateToast';
import OfflineBanner from '@/components/pwa/OfflineBanner';
import { SportProvider } from '@/lib/context/SportContext';

export const viewport: Viewport = {
  themeColor: '#0A0F0D',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'MATCHMIND | Football & NBA Basketball Statistical Projection Platform',
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
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Calibrall" />
        <meta name="theme-color" content="#0A0F0D" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('calibrall_monochrome_mode')==='true'){document.documentElement.classList.add('monochrome')}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-[100dvh] bg-[#0A0F0D] text-[#ECF1EE] flex flex-col antialiased selection:bg-[#B6E63B] selection:text-[#0A0F0D] pb-[calc(76px+env(safe-area-inset-bottom,0px))] md:pb-6">
        <InstallPromptProvider>
          <SportProvider>
            <Navbar />
            <OfflineBanner />
            <main className="flex-1 max-w-xl md:max-w-4xl lg:max-w-7xl w-full mx-auto px-4 py-3 min-w-0">
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
