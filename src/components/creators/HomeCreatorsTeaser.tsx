import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Building2 } from 'lucide-react';
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
      <div className="bg-[#0F1814] border border-[#1B2A23] rounded-[16px] p-[14px] space-y-3">
        {/* Row 1: 38px tile, "Built by" 12px muted over "Ghreatness Labs" 15px/600, "Est. 2024" mono pill on right */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {creators.company.logo ? (
              <div className="w-[38px] h-[38px] min-w-[38px] min-h-[38px] rounded-[10px] overflow-hidden border border-[#1B2A23] bg-[#142019] flex items-center justify-center shrink-0">
                <Image
                  src={creators.company.logo}
                  alt={creators.company.name}
                  width={38}
                  height={38}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="w-[38px] h-[38px] min-w-[38px] min-h-[38px] rounded-[10px] border border-[#1B2A23] bg-[#142019] flex items-center justify-center text-[#B8E63A] shrink-0">
                <Building2 className="w-[18px] h-[18px]" strokeWidth={1.7} />
              </div>
            )}
            <div className="min-w-0">
              <span className="text-[12px] font-[400] text-[#8B9B93] block leading-tight">
                Built by
              </span>
              <h3 className="text-[15px] font-[600] text-[#E9EFEB] leading-tight truncate mt-0.5">
                {creators.company.name}
              </h3>
            </div>
          </div>

          <div className="border border-[#1B2A23] px-2.5 py-0.5 rounded-full font-mono text-[11px] text-[#8B9B93] bg-[#0A0F0D] shrink-0 whitespace-nowrap">
            Est. 2024
          </div>
        </div>

        {/* Accent tagline at 13.5px */}
        <p className="text-[13.5px] font-[600] text-[#B8E63A] leading-tight">
          One platform. Multiple ventures. Infinite possibilities.
        </p>

        {/* 12.5px muted description */}
        <p className="text-[12.5px] font-[400] text-[#8B9B93] leading-[1.55]">
          A technology holding group and IT solutions provider simplifying digital transformation for startups, small businesses and companies.
        </p>

        {/* Small chips: fully rounded */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {teaserChips.map((chip) => (
            <span
              key={chip}
              className="border border-[#1B2A23] px-2.5 py-0.5 rounded-full text-[11px] font-[500] text-[#8B9B93] bg-[#0A0F0D]"
            >
              {chip}
            </span>
          ))}
        </div>

        {/* One line in 12.5px with "and more" link */}
        <p className="text-[12.5px] font-[400] text-[#8B9B93] leading-normal pt-0.5">
          Also from us: Calibrall, Gbedu Games, FragNaija{' '}
          <Link
            href="/creators#more-from-us"
            className="text-[#B8E63A] font-[500] hover:underline"
          >
            and more
          </Link>
        </p>

        {/* 5-icon social row: 40px icon buttons */}
        {availableSocials.length > 0 && (
          <div className="flex items-center gap-2 pt-0.5 flex-wrap">
            {availableSocials.map((platform) => (
              <a
                key={platform.key}
                href={platform.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Ghreatness Labs on ${platform.name}`}
                className="w-[40px] h-[40px] min-w-[40px] min-h-[40px] rounded-[10px] border border-[#1B2A23] bg-[#142019] hover:bg-[#1B2A23] text-[#8B9B93] hover:text-[#E9EFEB] flex items-center justify-center transition-colors touch-press focus-visible:outline-2 focus-visible:outline-[#B8E63A]"
              >
                <SocialIcon platform={platform.key} size={18} />
              </a>
            ))}
          </div>
        )}

        {/* Full-width 42px accent button: "Meet the creators ›" */}
        <div className="pt-1">
          <Link
            href="/creators"
            className="w-full h-[42px] px-4 rounded-[12px] bg-[#B8E63A] hover:bg-[#c8ee47] text-[#0A0F0D] font-[600] text-[13px] flex items-center justify-center gap-1.5 transition-colors touch-press focus-visible:outline-2 focus-visible:outline-[#B8E63A]"
          >
            <span>Meet the creators</span>
            <span className="text-[15px] font-bold leading-none">›</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
