import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AdminBackfillClient from '@/components/admin/AdminBackfillClient';

export const metadata: Metadata = {
  title: 'Admin Backfill',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminBackfillPage() {
  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin?tab=content"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--text-2)] hover:text-[var(--text)]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to system admin</span>
        </Link>
      </div>
      <AdminBackfillClient />
    </div>
  );
}
