'use client';

import React from 'react';
import { Check, Shield, Lock } from 'lucide-react';
import {
  TIER_ORDER,
  TIER_RULES,
  ADMIN_OVERRIDE_RULE,
  FREE_DAILY_SUMMARY_LIMIT,
} from '@/lib/tiers';
import { cleanDisplayText } from '@/lib/utils/formatText';

export default function AdminTierConfigSection() {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--text)] flex items-center gap-2">
              <Lock className="w-4 h-4 text-[var(--accent)]" />
              <span>Tier configuration rules</span>
            </h2>
            <p className="text-[12px] text-[var(--text-2)]">
              Read only snapshot directly from canonical tier configuration.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] text-[11px] text-[var(--text-2)]">
            Free daily summary cap: {FREE_DAILY_SUMMARY_LIMIT}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {TIER_ORDER.map((key) => {
            const rule = TIER_RULES[key];
            return (
              <div
                key={key}
                className="p-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[15px] font-bold text-[var(--text)]">{cleanDisplayText(rule.name)}</span>
                    <span className="text-[12px] font-mono text-[var(--accent)]">{cleanDisplayText(rule.billingLabel)}</span>
                  </div>
                  <p className="text-[12px] text-[var(--text-2)]">{cleanDisplayText(rule.summary)}</p>

                  <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11.5px]">
                    <div className="p-2 rounded-[6px] bg-[var(--surface)] border border-[var(--border)]">
                      <div className="text-[var(--text-3)]">Daily summaries</div>
                      <div className="font-semibold text-[var(--text)] tabular-nums">
                        {rule.dailySummaryLimit === null ? 'Unlimited' : rule.dailySummaryLimit}
                      </div>
                    </div>
                    <div className="p-2 rounded-[6px] bg-[var(--surface)] border border-[var(--border)]">
                      <div className="text-[var(--text-3)]">Alternates</div>
                      <div className="font-semibold text-[var(--text)] tabular-nums">
                        {rule.alternatePicksVisible > 0 ? `${rule.alternatePicksVisible} included` : 'Locked'}
                      </div>
                    </div>
                    <div className="p-2 rounded-[6px] bg-[var(--surface)] border border-[var(--border)]">
                      <div className="text-[var(--text-3)]">Drivers</div>
                      <div className="font-semibold text-[var(--text)]">
                        {rule.modelDriversVisible ? 'Full' : 'Redacted'}
                      </div>
                    </div>
                    <div className="p-2 rounded-[6px] bg-[var(--surface)] border border-[var(--border)]">
                      <div className="text-[var(--text-3)]">API workflows</div>
                      <div className="font-semibold text-[var(--text)]">
                        {rule.apiWorkflowAccess ? 'Enabled' : 'Standard'}
                      </div>
                    </div>
                  </div>
                </div>

                <ul className="space-y-1.5 pt-2 border-t border-[var(--border)]">
                  {rule.features.map((item, idx) => (
                    <li key={idx} className="text-[12px] text-[var(--text-2)] flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-[var(--accent)] mt-0.5 shrink-0" />
                      <span>{cleanDisplayText(item)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="p-3.5 rounded-[10px] border border-[var(--accent)]/30 bg-[var(--accent-soft)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <Shield className="w-4 h-4 text-[var(--accent)] mt-0.5 shrink-0" />
            <div>
              <div className="text-[13px] font-semibold text-[var(--text)]">
                Admin override rule
              </div>
              <div className="text-[12px] text-[var(--text-2)]">
                Effective tier: {ADMIN_OVERRIDE_RULE.effectiveTier}. Expiry enforced: {ADMIN_OVERRIDE_RULE.neverExpires ? 'Never' : 'Yes'}. {cleanDisplayText(ADMIN_OVERRIDE_RULE.description)}
              </div>
            </div>
          </div>
          <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] text-[var(--accent)] shrink-0">
            Read only
          </span>
        </div>
      </div>
    </div>
  );
}
