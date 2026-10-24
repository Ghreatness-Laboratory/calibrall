'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

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
        { label: 'Dixon-Coles goals engine', href: '/methodology' },
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
      ],
    },
    {
      id: 'governance',
      title: 'Governance',
      links: [
        { label: 'Responsible use', href: '/responsible-use' },
        { label: 'Terms of service', href: '/responsible-use' },
        { label: 'Privacy policy', href: '/responsible-use' },
        { label: 'Model version: Dixon-Coles v2.4.1', href: '/methodology' },
      ],
    },
  ];

  return (
    <footer className="mt-10 pb-6 border-t border-white/[0.07] pt-4 text-[12px] text-[#8B9890]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-2">
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
                            className="text-[#8B9890] hover:text-[#ECF1EE] transition-colors block py-0.5"
                          >
                            {link.label}
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

        {/* Small Centered Footer Line at 10.5px in subtle text color (#5E6A63) */}
        <div className="text-center pt-4 text-[10.5px] font-mono text-[#5E6A63]">
          © {new Date().getFullYear()} Calibrall · Every call, on record.
        </div>
      </div>
    </footer>
  );
}
