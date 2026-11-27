import React from 'react';
import { notFound } from 'next/navigation';
import { getServerAuthSession } from '@/lib/supabase/serverAuth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuthSession();

  if (!session || !session.isAdmin || session.profile.role !== 'admin' || session.profile.suspended) {
    notFound();
  }

  return <>{children}</>;
}
