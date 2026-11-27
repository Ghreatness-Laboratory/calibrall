import { NextRequest, NextResponse } from 'next/server';
import {
  getMiddlewareAuthSession,
  isSafeRedirectPath,
  type ServerAuthSession,
} from '@/lib/supabase/serverAuth';
import {
  isAdminPagePath,
  isAuthEntryPath,
  isPublicPagePath,
} from '@/lib/auth/routeAccess';

export interface MiddlewareDependencies {
  getSession?: (
    request: NextRequest,
    response: NextResponse
  ) => Promise<ServerAuthSession | null>;
}

export async function handleAuthMiddleware(
  request: NextRequest,
  deps?: MiddlewareDependencies
): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  // Never intercept Next internals or static assets
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/assets/') ||
    pathname === '/sw.js' ||
    pathname === '/favicon.ico' ||
    pathname === '/favicon-32x32.png' ||
    pathname === '/apple-touch-icon.png' ||
    pathname === '/manifest.webmanifest'
  ) {
    return NextResponse.next();
  }

  // API routes handle their own JSON 401/403/503 responses (never HTML redirects)
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const getSession = deps?.getSession ?? getMiddlewareAuthSession;
  const session = await getSession(request, response);

  // Redirect already signed-in users away from /login and /signup
  if (session && isAuthEntryPath(pathname) && !request.nextUrl.searchParams.get('error')) {
    const requestedNext = request.nextUrl.searchParams.get('next');
    const target = isSafeRedirectPath(requestedNext);
    return NextResponse.redirect(new URL(target, request.url));
  }

  // Public pages allow visitors without login
  if (isPublicPagePath(pathname)) {
    return response;
  }

  // /admin and /admin/* routes strictly require role === 'admin'; non-admins and visitors get 404
  if (isAdminPagePath(pathname)) {
    if (!session || !session.isAdmin || session.profile.role !== 'admin' || session.profile.suspended) {
      const notFoundRes = NextResponse.rewrite(new URL('/not-found', request.url), { status: 404 });
      notFoundRes.headers.set('Cache-Control', 'no-store, max-age=0');
      return notFoundRes;
    }
    return response;
  }

  // All other non-public routes require a valid signed-in session
  if (!session) {
    const loginUrl = new URL('/login', request.url);
    const fullTarget = `${pathname}${search || ''}`;
    loginUrl.searchParams.set('next', fullTarget);
    const redirectRes = NextResponse.redirect(loginUrl);
    redirectRes.headers.set('Cache-Control', 'no-store, max-age=0');
    return redirectRes;
  }

  return response;
}

export async function middleware(request: NextRequest) {
  return handleAuthMiddleware(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|favicon-32x32.png|apple-touch-icon.png|icons/|assets/|sw.js|manifest.webmanifest).*)',
  ],
};
