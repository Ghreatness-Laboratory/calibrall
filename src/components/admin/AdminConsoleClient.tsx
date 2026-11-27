'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutGrid,
  Users,
  CreditCard,
  SlidersHorizontal,
  Layers,
  Activity,
  History,
  Shield,
  Database,
} from 'lucide-react';
import AdminOverviewSection from './AdminOverviewSection';
import AdminUsersSection from './AdminUsersSection';
import AdminPaymentsSection from './AdminPaymentsSection';
import AdminContentModelSection from './AdminContentModelSection';
import AdminTierConfigSection from './AdminTierConfigSection';
import AdminSystemHealthSection from './AdminSystemHealthSection';
import AdminAuditLogSection from './AdminAuditLogSection';

export type AdminTabKey =
  | 'overview'
  | 'users'
  | 'payments'
  | 'content'
  | 'tiers'
  | 'health'
  | 'audit';

const TABS: Array<{ key: AdminTabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'payments', label: 'Payments', icon: CreditCard },
  { key: 'content', label: 'Content and model', icon: SlidersHorizontal },
  { key: 'tiers', label: 'Tier rules', icon: Layers },
  { key: 'health', label: 'System health', icon: Activity },
  { key: 'audit', label: 'Audit log', icon: History },
];

export default function AdminConsoleClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab') as AdminTabKey | null;
  const validTab = TABS.some((t) => t.key === rawTab) ? (rawTab as AdminTabKey) : 'overview';
  const [activeTab, setActiveTab] = useState<AdminTabKey>(validTab);

  useEffect(() => {
    setActiveTab(validTab);
  }, [validTab]);

  const handleTabSelect = (key: AdminTabKey) => {
    setActiveTab(key);
    router.replace(key === 'overview' ? '/admin' : `/admin?tab=${key}`, { scroll: false });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="p-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[var(--accent)]" />
            <h1 className="text-[18px] font-bold text-[var(--text)]">System admin</h1>
          </div>
          <p className="text-[12.5px] text-[var(--text-2)]">
            Operations, user entitlements, payments, pick moderation, tier configuration, and health.
          </p>
        </div>

        <Link
          href="/admin/backfill"
          className="h-9 px-3.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] text-[12.5px] font-medium flex items-center justify-center gap-1.5 hover:border-[var(--accent)] transition-colors shrink-0"
        >
          <Database className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>Backfill console</span>
        </Link>
      </div>

      {/* Responsive Tab Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabSelect(tab.key)}
              className={`h-9 px-3 rounded-[8px] border text-[12.5px] font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                isActive
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:text-[var(--text)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Section Viewport */}
      <div>
        {activeTab === 'overview' && <AdminOverviewSection />}
        {activeTab === 'users' && <AdminUsersSection />}
        {activeTab === 'payments' && <AdminPaymentsSection />}
        {activeTab === 'content' && <AdminContentModelSection />}
        {activeTab === 'tiers' && <AdminTierConfigSection />}
        {activeTab === 'health' && <AdminSystemHealthSection />}
        {activeTab === 'audit' && <AdminAuditLogSection />}
      </div>
    </div>
  );
}
