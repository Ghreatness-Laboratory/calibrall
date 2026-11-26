import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://calibrall.vercel.app';
  const routes = [
    '',
    '/about',
    '/terms',
    '/privacy',
    '/login',
    '/signup',
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: (route === '' ? 'daily' : 'monthly') as MetadataRoute.Sitemap[number]['changeFrequency'],
    priority: route === '' ? 1.0 : 0.6,
  }));
}
