import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Calibrall',
    short_name: 'Calibrall',
    description: 'Every call, on record. Probabilistic football analytics.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a1812',
    theme_color: '#0a1812',
    categories: ['sports', 'finance', 'utilities'],
    icons: [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512x512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Fixtures',
        short_name: 'Fixtures',
        description: 'View scheduled fixtures and probabilistic projections',
        url: '/matches',
        icons: [{ src: '/icons/icon-192x192.png', sizes: '192x192' }],
      },
      {
        name: 'Top picks',
        short_name: 'Picks',
        description: 'Daily verified expected value opportunities',
        url: '/predictions',
        icons: [{ src: '/icons/icon-192x192.png', sizes: '192x192' }],
      },
      {
        name: 'Track record',
        short_name: 'Record',
        description: 'Audited walk-forward calibration curves and Brier score',
        url: '/performance',
        icons: [{ src: '/icons/icon-192x192.png', sizes: '192x192' }],
      },
    ],
  };
}
