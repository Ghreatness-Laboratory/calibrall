export const PUBLIC_EXACT_ROUTES = new Set<string>([
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/terms',
  '/privacy',
  '/about',
  '/offline',
  '/manifest.webmanifest',
  '/robots.txt',
  '/sitemap.xml',
]);

export const EXPIRED_ALLOWED_EXACT_ROUTES = new Set<string>([
  '/',
  '/pricing',
  '/account',
  '/settings',
  '/terms',
  '/privacy',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/offline',
  '/manifest.webmanifest',
  '/robots.txt',
  '/sitemap.xml',
]);

export const PUBLIC_PREFIXES = [
  '/_next/',
  '/icons/',
  '/assets/',
];

export const PUBLIC_STATIC_FILES = new Set<string>([
  '/sw.js',
  '/favicon.ico',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
]);

export function isPublicPagePath(pathname: string): boolean {
  if (PUBLIC_EXACT_ROUTES.has(pathname)) return true;
  if (PUBLIC_STATIC_FILES.has(pathname)) return true;
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  if (pathname.startsWith('/auth/')) return true;
  return false;
}

export function isExpiredAllowedPagePath(pathname: string): boolean {
  if (EXPIRED_ALLOWED_EXACT_ROUTES.has(pathname)) return true;
  if (PUBLIC_STATIC_FILES.has(pathname)) return true;
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  if (pathname.startsWith('/auth/') || pathname.startsWith('/pricing/')) return true;
  return false;
}

export function isAdminPagePath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export function isAuthEntryPath(pathname: string): boolean {
  return pathname === '/login' || pathname === '/signup';
}
