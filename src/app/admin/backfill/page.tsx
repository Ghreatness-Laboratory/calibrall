import type { Metadata } from 'next';
import AdminBackfillClient from '@/components/admin/AdminBackfillClient';

export const metadata: Metadata = {
  title: 'Admin Backfill',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminBackfillPage() {
  return <AdminBackfillClient />;
}
