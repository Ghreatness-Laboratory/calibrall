import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getServerSupabaseConfig } from '@/lib/supabase/serverAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST() {
  const cookieStore = cookies();
  const { url, anonKey, isAuthConfigured } = getServerSupabaseConfig();

  const response = NextResponse.json(
    { success: true },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );

  if (isAuthConfigured) {
    try {
      const supabase = createServerClient(url, anonKey, {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      });
      await supabase.auth.signOut();
    } catch {}
  }

  for (const c of cookieStore.getAll()) {
    if (c.name.startsWith('sb-') || c.name === 'calibrall_tier') {
      response.cookies.set(c.name, '', { path: '/', maxAge: 0 });
    }
  }

  return response;
}
