import React from 'react';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/supabase/serverAuth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuthSession();

  if (!session) {
    redirect('/login?next=/admin');
  }

  if (!session.isAdmin) {
    redirect('/fixtures');
  }

  return <>{children}</>;
}
