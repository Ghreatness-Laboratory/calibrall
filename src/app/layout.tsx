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
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0d14] text-gray-100 flex flex-col antialiased selection:bg-brand-emerald selection:text-black">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
