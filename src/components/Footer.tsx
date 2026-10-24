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
    <footer className="mt-8 pb-6 border-t border-[#1B2A23] pt-4 text-[12px] text-[#8B9B93]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-3">
        {/* Three Collapsible Accordion Rows */}
        <div className="border border-[#1B2A23] bg-[#0F1814] rounded-[16px] divide-y divide-[#1B2A23] overflow-hidden">
          {sections.map((section) => {
            const isOpen = openSections[section.id];
            return (
              <div key={section.id} className="transition-colors">
                <button
                  onClick={() => toggleSection(section.id)}
                  type="button"
                  className="w-full min-h-[44px] px-4 py-3 flex items-center justify-between text-left hover:bg-[#142019]/60 transition-colors select-none"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-[600] text-[#E9EFEB]">
                      {section.title}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[4px] bg-[#142019] text-[#5E6F67] border border-[#1B2A23]">
                      {section.links.length} items
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-[#8B9B93] transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-[#B8E63A]' : ''
                    }`}
                    strokeWidth={1.7}
                  />
                </button>

                {isOpen && (
                  <div className="px-4 pb-3 pt-1 bg-[#0A0F0D]/40">
                    <ul className="space-y-1.5 text-[12px]">
                      {section.links.map((link, idx) => (
                        <li key={idx}>
                          <Link
                            href={link.href}
                            className={`hover:text-[#E9EFEB] transition-colors flex items-center gap-1.5 py-0.5 ${
                              link.isCreator ? 'text-[#B8E63A]' : 'text-[#8B9B93]'
                            }`}
                          >
                            {link.isCreator && (
                              <Building2 className="w-3.5 h-3.5 text-[#B8E63A] shrink-0" strokeWidth={1.7} />
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

        {/* Social icon row: 40px buttons */}
        {activeSocials.length > 0 && (
          <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
            {activeSocials.map((platform) => (
              <a
                key={platform.key}
                href={platform.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Ghreatness Labs on ${platform.name}`}
                className="w-[40px] h-[40px] min-w-[40px] min-h-[40px] rounded-[10px] border border-[#1B2A23] bg-[#0F1814] hover:bg-[#142019] text-[#8B9B93] hover:text-[#E9EFEB] flex items-center justify-center transition-colors touch-press focus-visible:outline-2 focus-visible:outline-[#B8E63A]"
              >
                <SocialIcon platform={platform.key} size={18} />
              </a>
            ))}
          </div>
        )}

        {/* Footer Copyright */}
        <div className="text-center pt-1 text-[11px] font-[400] text-[#5E6F67]">
          © 2024 to {currentYear} Ghreatness Labs. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
