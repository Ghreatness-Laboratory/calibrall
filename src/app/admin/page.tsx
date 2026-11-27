import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import AdminConsoleClient from '@/components/admin/AdminConsoleClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'System admin | Calibrall',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-[var(--text-2)]">
          Loading admin console...
        </div>
      }
    >
      <AdminConsoleClient />
    </Suspense>
  );
}
