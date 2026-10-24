import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://calibrall.vercel.app';
  const routes = [
    '',
    '/creators',
    '/dashboard',
    '/matches',
    '/predictions',
    '/markets',
    '/performance',
    '/pricing',
    '/methodology',
    '/responsible-use',
    '/saved',
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: (route === '' || route === '/matches' || route === '/predictions' ? 'daily' : 'weekly') as MetadataRoute.Sitemap[number]['changeFrequency'],
    priority: route === '' ? 1.0 : route === '/creators' ? 0.8 : 0.7,
  }));
}
