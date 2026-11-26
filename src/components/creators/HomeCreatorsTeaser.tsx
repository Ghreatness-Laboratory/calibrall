import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Building2, ChevronRight } from 'lucide-react';
import { creators, getSocialUrl } from '@/content/creators';
import SocialIcon from '@/components/creators/SocialIcon';

export default function HomeCreatorsTeaser() {
  const teaserSocials: {
    key: 'x' | 'instagram' | 'linkedin' | 'telegram' | 'youtube';
    name: string;
  }[] = [
    { key: 'x', name: 'X' },
    { key: 'instagram', name: 'Instagram' },
    { key: 'linkedin', name: 'LinkedIn' },
    { key: 'telegram', name: 'Telegram' },
    { key: 'youtube', name: 'YouTube' },
  ];

  const availableSocials = teaserSocials
    .map((s) => {
      const handle = creators.social[s.key];
      const url = getSocialUrl(s.key, handle);
      return { ...s, handle, url };
    })
    .filter((s) => Boolean(s.handle && s.url));

  const teaserChips = ['Platform-as-a-Service', 'IT solutions', 'Venture incubation'];

  return (
    <section className="pt-1">
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {creators.company.logo ? (
              <div className="w-10 h-10 rounded-[12px] overflow-hidden border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-center shrink-0">
                <Image
                  src={creators.company.logo}
                  alt={creators.company.name}
                  width={40}
                  height={40}
                  className="w-full h-full object-contain"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-center text-[var(--accent)] shrink-0">
                <Building2 className="w-5 h-5" strokeWidth={1.7} />
              </div>
            )}
            <div className="min-w-0">
              <span className="text-[11.5px] text-[var(--text-2)] block leading-tight">
                Built by
              </span>
              <h3 className="font-display text-[15px] font-semibold text-[var(--text)] leading-tight truncate mt-0.5">
                {creators.company.name}
              </h3>
            </div>
          </div>

          <div className="border border-[var(--line)] px-2.5 py-1 rounded-full text-[11px] text-[var(--text-2)] bg-[var(--surface-2)] shrink-0 whitespace-nowrap tabular-nums">
            Est. 2024
          </div>
        </div>

        <p className="text-[13px] font-semibold text-[var(--accent)] leading-tight">
          One platform. Multiple ventures. Infinite possibilities.
        </p>

        <p className="text-[12.5px] text-[var(--text-2)] leading-[1.5]">
          A technology holding group and IT solutions provider simplifying digital transformation for startups, small businesses and companies.
        </p>

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {teaserChips.map((chip) => (
            <span
              key={chip}
              className="border border-[var(--line)] px-2.5 py-0.5 rounded-full text-[11px] font-medium text-[var(--text-2)] bg-[var(--surface-2)]"
            >
              {chip}
            </span>
          ))}
        </div>

        <p className="text-[12.5px] text-[var(--text-2)] leading-normal pt-0.5">
          Also from us: Calibrall, Gbedu Games, FragNaija{' '}
          <Link href="/creators#more-from-us" className="text-[var(--accent)] font-medium hover:underline">
            and more
          </Link>
        </p>

        {availableSocials.length > 0 && (
          <div className="flex items-center gap-2 pt-0.5 flex-wrap">
            {availableSocials.map((platform) => (
              <a
                key={platform.key}
                href={platform.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Ghreatness Labs on ${platform.name}`}
                className="w-[44px] h-[44px] rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--border-strong)] text-[var(--text-2)] hover:text-[var(--text)] flex items-center justify-center transition-colors touch-press"
              >
                <SocialIcon platform={platform.key} size={18} />
              </a>
            ))}
          </div>
        )}

        <div className="pt-1">
          <Link
            href="/creators"
            className="w-full min-h-[44px] px-4 rounded-[12px] bg-[var(--accent-fill)] hover:opacity-95 text-[var(--accent-ink)] font-bold text-[13px] flex items-center justify-center gap-1.5 transition-all touch-press"
          >
            <span>Meet the creators</span>
            <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
          </Link>
        </div>
      </div>
    </section>
  );
}
