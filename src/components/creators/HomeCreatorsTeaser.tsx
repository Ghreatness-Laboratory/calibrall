import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Building2, ArrowRight } from 'lucide-react';
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
    <section className="pt-2">
      <div className="bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[12px] p-4 space-y-3">
        {/* Row 1: 40px logo tile, label above name, EST chip on right */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {creators.company.logo ? (
              <div className="w-[40px] h-[40px] min-w-[40px] rounded-[8px] overflow-hidden border-[0.5px] border-white/[0.08] bg-white/[0.06] flex items-center justify-center shrink-0">
                <Image
                  src={creators.company.logo}
                  alt={creators.company.name}
                  width={40}
                  height={40}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="w-[40px] h-[40px] min-w-[40px] rounded-[8px] border-[0.5px] border-white/[0.08] bg-white/[0.06] flex items-center justify-center text-[#8fa69a] shrink-0">
                <Building2 className="w-5 h-5 text-[#b8e63a]" strokeWidth={1.75} />
              </div>
            )}
            <div className="min-w-0">
              <span className="text-[11px] font-[400] text-[#8fa69a] block leading-tight">
                Built by
              </span>
              <h3 className="text-[15px] font-[500] text-[#e8efe9] leading-tight truncate mt-0.5">
                {creators.company.name}
              </h3>
            </div>
          </div>

          {creators.company.founded && (
            <div className="border-[0.5px] border-white/[0.08] px-2 py-0.5 rounded-[4px] font-mono text-[11px] text-[#8fa69a] shrink-0 whitespace-nowrap">
              EST. {creators.company.founded}
            </div>
          )}
        </div>

        {/* Tagline */}
        <p className="text-[13px] font-[500] text-[#b8e63a] leading-tight">
          One platform. Multiple ventures. Infinite possibilities.
        </p>

        {/* Paragraph: 2 to 3 lines */}
        <p className="text-[12px] font-[400] text-[#8fa69a] leading-[1.6]">
          A technology holding group and IT solutions provider simplifying digital transformation for startups, small businesses and companies.
        </p>

        {/* Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {teaserChips.map((chip) => (
            <span
              key={chip}
              className="border-[0.5px] border-white/[0.08] px-2.5 py-1 rounded-[6px] text-[11px] font-[400] text-[#8fa69a] bg-[#101713]"
            >
              {chip}
            </span>
          ))}
        </div>

        {/* One line with and more link */}
        <p className="text-[12px] font-[400] text-[#8fa69a] leading-normal pt-0.5">
          Also from us: Calibrall, Gbedu Games, FragNaija{' '}
          <Link
            href="/creators#more-from-us"
            className="text-[#b8e63a] hover:underline font-[500]"
          >
            and more
          </Link>
        </p>

        {/* Social row: 34px outlined icon buttons */}
        {availableSocials.length > 0 && (
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            {availableSocials.map((platform) => (
              <a
                key={platform.key}
                href={platform.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Ghreatness Labs on ${platform.name}`}
                className="w-[34px] h-[34px] min-w-[34px] min-h-[34px] rounded-[8px] border-[0.5px] border-white/[0.08] bg-[#101713] hover:bg-[#151E19] text-[#8fa69a] hover:text-[#e8efe9] flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-[#b8e63a]"
              >
                <SocialIcon platform={platform.key} size={16} />
              </a>
            ))}
          </div>
        )}

        {/* Full-width outlined button */}
        <div className="pt-1">
          <Link
            href="/creators"
            className="w-full h-[42px] px-4 rounded-[8px] border-[0.5px] border-white/[0.08] bg-[#101713] hover:bg-[#151E19] text-[#e8efe9] hover:text-[#b8e63a] text-[13px] font-[500] flex items-center justify-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-[#b8e63a]"
          >
            <span>Meet the creators</span>
            <ArrowRight className="w-4 h-4 text-[#b8e63a]" strokeWidth={1.75} />
          </Link>
        </div>
      </div>
    </section>
  );
}
