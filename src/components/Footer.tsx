'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Building2 } from 'lucide-react';
import { creators, getSocialUrl } from '@/content/creators';
import SocialIcon from '@/components/creators/SocialIcon';

export default function Footer() {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    analytics: false,
    navigation: false,
    governance: false,
  });

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const sections = [
    {
      id: 'analytics',
      title: 'Analytics and models',
      links: [
        { label: 'Dixon Coles goals engine', href: '/methodology' },
        { label: 'Negative binomial corners', href: '/methodology' },
        { label: 'Disciplinary card model', href: '/methodology' },
        { label: 'Brier score calibration', href: '/performance' },
      ],
    },
    {
      id: 'navigation',
      title: 'Navigation',
      links: [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Fixtures & matches', href: '/matches' },
        { label: 'Model predictions', href: '/predictions' },
        { label: 'Market explorer', href: '/markets' },
        { label: 'Subscription tiers', href: '/pricing' },
        { label: 'Meet the creators', href: '/creators', isCreator: true },
      ],
    },
    {
      id: 'governance',
      title: 'Governance',
      links: [
        { label: 'Responsible use', href: '/responsible-use' },
        { label: 'Terms of service', href: '/responsible-use' },
        { label: 'Privacy policy', href: '/responsible-use' },
        { label: 'Model version: Dixon Coles v2.5.0', href: '/methodology' },
      ],
    },
  ];

  const footerSocials: {
    key: 'x' | 'instagram' | 'linkedin' | 'telegram' | 'github' | 'youtube' | 'tiktok';
    name: string;
  }[] = [
    { key: 'x', name: 'X' },
    { key: 'instagram', name: 'Instagram' },
    { key: 'linkedin', name: 'LinkedIn' },
    { key: 'telegram', name: 'Telegram' },
    { key: 'github', name: 'GitHub' },
    { key: 'youtube', name: 'YouTube' },
    { key: 'tiktok', name: 'TikTok' },
  ];

  const activeSocials = footerSocials
    .map((p) => {
      const handle = creators.social[p.key];
      const url = getSocialUrl(p.key, handle);
      return { ...p, handle, url };
    })
    .filter((item) => Boolean(item.handle && item.url));

  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-6 pb-[calc(78px+env(safe-area-inset-bottom,0px))] md:pb-8 border-t border-[var(--line)] pt-4 text-[12.5px] text-[var(--text-2)]">
      <div className="max-w-[430px] md:max-w-4xl lg:max-w-7xl mx-auto px-4 space-y-3">
        <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[18px] divide-y divide-[var(--line)] overflow-hidden">
          {sections.map((section) => {
            const isOpen = openSections[section.id];
            return (
              <div key={section.id} className="transition-colors">
                <button
                  onClick={() => toggleSection(section.id)}
                  type="button"
                  className="w-full min-h-[44px] px-4 py-2.5 flex items-center justify-between text-left hover:bg-[var(--surface-2)] transition-colors select-none touch-press"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[var(--text)]">
                      {section.title}
                    </span>
                    <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--text-3)] border border-[var(--line)] tabular-nums">
                      {section.links.length}
                    </span>
                  </div>

                  <ChevronDown
                    className={`w-4 h-4 text-[var(--text-2)] transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-[var(--accent)]' : ''
                    }`}
                    strokeWidth={2}
                  />
                </button>

                {isOpen && (
                  <div className="px-4 pb-3 pt-1 bg-[var(--bg)]/40">
                    <ul className="space-y-1 text-[12.5px]">
                      {section.links.map((link, idx) => (
                        <li key={idx}>
                          <Link
                            href={link.href}
                            className={`min-h-[44px] hover:text-[var(--text)] transition-colors flex items-center gap-1.5 ${
                              link.isCreator ? 'text-[var(--accent)]' : 'text-[var(--text-2)]'
                            }`}
                          >
                            {link.isCreator && (
                              <Building2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" strokeWidth={2} />
                            )}
                            <span>{link.label}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {activeSocials.length > 0 && (
          <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
            {activeSocials.map((platform) => (
              <a
                key={platform.key}
                href={platform.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Ghreatness Labs on ${platform.name}`}
                className="w-[44px] h-[44px] rounded-[12px] border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)] flex items-center justify-center transition-colors touch-press"
              >
                <SocialIcon platform={platform.key} size={16} />
              </a>
            ))}
          </div>
        )}

        <div className="pt-2 border-t border-[var(--line)] text-center text-[11px] text-[var(--text-3)] space-y-1 max-w-2xl mx-auto leading-relaxed">
          <p>
            Data sources & attribution: <span className="text-[var(--text-2)]">football-data.co.uk</span>, <span className="text-[var(--text-2)]">football-data.org</span>, <span className="text-[var(--text-2)]">England Football Results</span> (CC BY 4.0), and <span className="text-[var(--text-2)]">TheSportsDB</span>.
          </p>
          <p className="font-medium text-[var(--text-2)]">
            Statistical analysis, not financial or betting advice. 18+. Gamble responsibly.
          </p>
        </div>

        <div className="text-center pt-1 text-[10.5px] text-[var(--text-3)]">
          © 2024–{currentYear} Calibrall. All model projections recorded on ledger.
        </div>
      </div>
    </footer>
  );
}
