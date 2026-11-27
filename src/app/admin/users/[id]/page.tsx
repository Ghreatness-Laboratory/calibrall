import React from 'react';
import type { Metadata } from 'next';
import AdminUserDetailClient from '@/components/admin/AdminUserDetailClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Manage user | System admin',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminUserDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <AdminUserDetailClient userId={decodeURIComponent(params.id)} />;
}
