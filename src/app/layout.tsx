import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'CALIBRALL | Every call, on record.',
  description: 'CALIBRALL is an institutional-grade football prediction and market intelligence terminal. Multi-market statistical evaluation, expected value discovery, and verifiable calibration. Every call, on record.',
  openGraph: {
    title: 'CALIBRALL | Every call, on record.',
    description: 'CALIBRALL is an institutional-grade football prediction and market intelligence terminal. Multi-market statistical evaluation, expected value discovery, and verifiable calibration. Every call, on record.',
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
      <body className="min-h-screen bg-[#071510] text-[#eeede3] flex flex-col antialiased selection:bg-brand-accent selection:text-black">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
