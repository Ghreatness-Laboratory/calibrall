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
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
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
        { label: 'Model version: Dixon Coles v2.4.1', href: '/methodology' },
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
    .map(p => {
      const handle = creators.social[p.key];
      const url = getSocialUrl(p.key, handle);
      return { ...p, handle, url };
    })
    .filter(item => Boolean(item.handle && item.url));

  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-10 pb-6 border-t border-white/[0.07] pt-4 text-[12px] text-[#8B9890]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-3">
        {/* Three Collapsible Accordion Rows */}
        <div className="border border-white/[0.07] bg-[#101713] rounded-[14px] divide-y divide-white/[0.07] overflow-hidden">
          {sections.map((section) => {
            const isOpen = openSections[section.id];
            return (
              <div key={section.id} className="transition-colors">
                <button
                  onClick={() => toggleSection(section.id)}
                  type="button"
                  className="w-full min-h-[44px] px-4 py-3 flex items-center justify-between text-left hover:bg-[#151E19]/60 transition-colors select-none"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[#ECF1EE]">
                      {section.title}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[4px] bg-[#151E19] text-[#5E6A63] border border-white/[0.05]">
                      {section.links.length} items
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-[#8B9890] transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-[#B6E63B]' : ''
                    }`}
                    strokeWidth={2}
                  />
                </button>

                {isOpen && (
                  <div className="px-4 pb-3 pt-1 bg-[#0A0F0D]/40">
                    <ul className="space-y-1.5 text-[12px]">
                      {section.links.map((link, idx) => (
                        <li key={idx}>
                          <Link
                            href={link.href}
                            className={`hover:text-[#ECF1EE] transition-colors flex items-center gap-1.5 py-0.5 ${
                              link.isCreator ? 'text-[#B6E63B]' : 'text-[#8B9890]'
                            }`}
                          >
                            {link.isCreator && (
                              <Building2 className="w-3.5 h-3.5 text-[#B6E63B] shrink-0" strokeWidth={2} />
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

        {/* Social icon row */}
        {activeSocials.length > 0 && (
          <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
            {activeSocials.map((platform) => (
              <a
                key={platform.key}
                href={platform.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Ghreatness Labs on ${platform.name}`}
                className="w-[34px] h-[34px] min-w-[34px] min-h-[34px] rounded-[8px] border-[0.5px] border-white/[0.08] bg-[#101713] hover:bg-[#151E19] text-[#8fa69a] hover:text-[#e8efe9] flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-[#B6E63B]"
              >
                <SocialIcon platform={platform.key} size={16} />
              </a>
            ))}
          </div>
        )}

        {/* Footer Copyright */}
        <div className="text-center pt-1 text-[11px] font-[400] text-[#5E6A63]">
          © 2024 to {currentYear} Ghreatness Labs. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
