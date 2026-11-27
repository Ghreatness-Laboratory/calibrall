import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AdminUsersSection from '@/components/admin/AdminUsersSection';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin Users',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminUsersPage() {
  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin?tab=users"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--text-2)] hover:text-[var(--text)]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to system admin</span>
        </Link>
      </div>
      <AdminUsersSection />
    </div>
  );
}
