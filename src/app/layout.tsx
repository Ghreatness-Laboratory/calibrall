import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';

export const metadata = {
  title: 'Calibrall | Every call, on record.',
  description: 'Calibrall is an institutional-grade sports analytics and market intelligence terminal. Multi-market statistical evaluation, expected value discovery, and verifiable calibration.',
  openGraph: {
    title: 'Calibrall | Every call, on record.',
    description: 'Calibrall is an institutional-grade sports analytics and market intelligence terminal. Multi-market statistical evaluation, expected value discovery, and verifiable calibration.',
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
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('calibrall_monochrome_mode')==='true'){document.documentElement.classList.add('monochrome')}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen bg-[#0a1812] text-[#e8efe9] flex flex-col antialiased selection:bg-[#b8e63a] selection:text-black pb-[calc(72px+env(safe-area-inset-bottom,0px))] md:pb-0">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-[18px] sm:px-6 lg:px-8 py-5">
          {children}
        </main>
        <Footer />
        <BottomNav />
      </body>
    </html>
  );
}
