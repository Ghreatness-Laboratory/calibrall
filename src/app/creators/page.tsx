import React from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { 
  Building2, 
  Layers, 
  ServerCog, 
  Rocket, 
  ArrowUpRight, 
  ChevronRight,
  Mail
} from 'lucide-react';
import { creators, getSocialUrl } from '@/content/creators';
import SocialIcon from '@/components/creators/SocialIcon';

export const metadata: Metadata = {
  title: 'Meet the creators | Ghreatness Labs | Calibrall',
  description: 'Ghreatness Labs is a technology holding group and IT solutions provider that builds and scales technology-driven brands.',
  alternates: {
    canonical: 'https://calibrall.vercel.app/creators',
  },
  openGraph: {
    title: 'Meet the creators | Ghreatness Labs | Calibrall',
    description: 'Ghreatness Labs is a technology holding group and IT solutions provider that builds and scales technology-driven brands.',
    url: 'https://calibrall.vercel.app/creators',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Meet the creators | Ghreatness Labs | Calibrall',
    description: 'Ghreatness Labs is a technology holding group and IT solutions provider that builds and scales technology-driven brands.',
  },
};

export default function CreatorsPage() {
  const socialPlatforms: {
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

  const activeSocials = socialPlatforms
    .map(p => {
      const handle = creators.social[p.key];
      const url = getSocialUrl(p.key, handle);
      return { ...p, handle, url };
    })
    .filter(item => Boolean(item.handle && item.url));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: creators.company.name,
    foundingDate: creators.company.founded || undefined,
    description: creators.company.description,
    url: 'https://calibrall.vercel.app/creators',
    logo: creators.company.logo || undefined,
    sameAs: activeSocials.map(s => s.url),
    brand: creators.products
      .filter(p => Boolean(p.name))
      .map(p => ({
        '@type': 'Brand',
        name: p.name,
        url: p.url || undefined,
      })),
  };

  const getWhatWeDoIcon = (iconName: string) => {
    switch (iconName) {
      case 'layers':
        return Layers;
      case 'server-cog':
        return ServerCog;
      case 'rocket':
        return Rocket;
      default:
        return Layers;
    }
  };

  const iconTints = [
    'text-[#B8E63A]',
    'text-[#5eb6e8]',
    'text-[#e3b341]',
  ];

  return (
    <div className="max-w-xl mx-auto space-y-3 py-1 min-w-0 pb-12">
      {/* Structured Data (JSON-LD) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Small ‹ Home back row */}
      <div className="pb-0.5">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[12px] font-[500] text-[#8B9B93] hover:text-[#E9EFEB] transition-colors py-1 touch-press"
        >
          <span className="text-[14px] leading-none">‹</span>
          <span>Home</span>
        </Link>
      </div>

      {/* Header section */}
      <header className="space-y-1 text-left pb-1">
        <h1 className="text-[22px] font-[700] leading-[1.2] text-[#E9EFEB] tracking-[-0.015em] text-left">
          Built by Ghreatness Labs
        </h1>
        <p className="text-[13px] font-[400] leading-[1.55] text-[#8B9B93] text-left max-w-xl">
          Calibrall is a product of Ghreatness Labs, a technology holding group that builds and scales technology-driven brands.
        </p>
      </header>

      {/* Company card */}
      <section className="bg-[#0F1814] border border-[#1B2A23] rounded-[16px] p-[14px] space-y-3">
        {/* Top: 38px icon tile, name 15px/600, descriptor 12px muted (no truncation) */}
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
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-[600] text-[#E9EFEB] leading-tight">
              {creators.company.name}
            </h2>
            <p className="text-[12px] font-[400] text-[#8B9B93] leading-tight mt-0.5">
              Holding group for technology-driven brands
            </p>
          </div>
        </div>

        {/* 12.5px body text */}
        {creators.company.description && (
          <p className="text-[12.5px] font-[400] text-[#8B9B93] leading-[1.6]">
            {creators.company.description}
          </p>
        )}

        {/* 3 small chips: fully rounded */}
        {creators.audiences && creators.audiences.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {creators.audiences.map((audience) => (
              <span
                key={audience}
                className="border border-[#1B2A23] px-2.5 py-0.5 rounded-full text-[11px] font-[500] text-[#8B9B93] bg-[#0A0F0D]"
              >
                {audience}
              </span>
            ))}
          </div>
        )}

        {/* Stats row separated by hairline */}
        <div className="border-t border-[#1B2A23] pt-2.5 grid grid-cols-3 divide-x divide-[#1B2A23] text-center">
          <div className="px-1">
            <div className="text-[13.5px] font-mono font-[600] text-[#E9EFEB]">
              2024
            </div>
            <div className="text-[11px] font-[400] text-[#8B9B93] mt-0.5">
              Established
            </div>
          </div>
          <div className="px-1">
            <div className="text-[13.5px] font-mono font-[600] text-[#E9EFEB]">
              9
            </div>
            <div className="text-[11px] font-[400] text-[#8B9B93] mt-0.5">
              Products
            </div>
          </div>
          <div className="px-1">
            <div className="text-[13.5px] font-mono font-[600] text-[#E9EFEB]">
              3
            </div>
            <div className="text-[11px] font-[400] text-[#8B9B93] mt-0.5">
              Services
            </div>
          </div>
        </div>
      </section>

      {/* Tagline as a 14px/600 accent line */}
      {creators.company.tagline && (
        <div className="py-0.5 text-left">
          <p className="text-[14px] font-[600] text-[#B8E63A] leading-relaxed">
            &ldquo;{creators.company.tagline}&rdquo;
          </p>
        </div>
      )}

      {/* What we do: Grouped list of 3 rows in one rounded container */}
      {creators.whatWeDo && creators.whatWeDo.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="text-[15px] font-[600] text-[#E9EFEB]">
            What we do
          </h2>

          <div className="bg-[#0F1814] border border-[#1B2A23] rounded-[16px] divide-y divide-[#1B2A23] overflow-hidden">
            {creators.whatWeDo.map((item, index) => {
              const IconComponent = getWhatWeDoIcon(item.icon);
              const tint = iconTints[index % iconTints.length];
              return (
                <div
                  key={item.title}
                  className="p-3 flex items-start gap-3"
                >
                  <div className={`w-[38px] h-[38px] min-w-[38px] min-h-[38px] rounded-[10px] bg-[#142019] border border-[#1B2A23] flex items-center justify-center shrink-0 ${tint}`}>
                    <IconComponent className="w-[18px] h-[18px]" strokeWidth={1.7} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[13.5px] font-[600] text-[#E9EFEB] leading-tight">
                      {item.title}
                    </h3>
                    <p className="text-[12px] font-[400] text-[#8B9B93] leading-[1.5] mt-0.5 line-clamp-2">
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* About the team (Hidden while team is empty) */}
      {creators.team && creators.team.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[15px] font-[600] text-[#E9EFEB]">
            About the team
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {creators.team.map((member) => (
              <div
                key={member.name}
                className="bg-[#0F1814] border border-[#1B2A23] rounded-[16px] p-3.5 space-y-2"
              >
                <div className="flex items-center gap-3">
                  {member.photo ? (
                    <div className="w-[48px] h-[48px] rounded-full overflow-hidden shrink-0">
                      <Image
                        src={member.photo}
                        alt={member.name}
                        width={48}
                        height={48}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="w-[48px] h-[48px] rounded-full bg-[#142019] border border-[#1B2A23] text-[#B8E63A] font-mono text-[14px] font-[600] flex items-center justify-center shrink-0">
                      {member.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-[600] text-[#E9EFEB] truncate">
                      {member.name}
                    </h3>
                    <p className="text-[12px] font-[400] text-[#8B9B93] truncate">
                      {member.role}
                    </p>
                  </div>
                </div>
                {member.bio && (
                  <p className="text-[12px] font-[400] text-[#8B9B93] leading-[1.55]">
                    {member.bio}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* More from us: Grouped list of 9 rows */}
      <section id="more-from-us" className="space-y-1.5 scroll-mt-20">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-[600] text-[#E9EFEB]">
            More from us
          </h2>
          <span className="text-[11px] font-mono font-[500] text-[#8B9B93]">
            {creators.products.length} products
          </span>
        </div>
        <p className="text-[12px] font-[400] text-[#8B9B93]">
          Brands and platforms built and scaled under Ghreatness Labs.
        </p>

        {/* Grouped list of rows divided by hairlines */}
        <div className="bg-[#0F1814] border border-[#1B2A23] rounded-[16px] overflow-hidden divide-y divide-[#1B2A23]">
          {creators.products.map((product) => {
            const hasUrl = Boolean(product.url);
            const hasDesc = Boolean(product.description);
            const isCurrent = Boolean(product.current);
            const initial = product.name ? product.name.charAt(0) : '';

            const rowContent = (
              <div
                className={`min-h-[48px] px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                  isCurrent
                    ? 'bg-[#B8E63A]/[0.05]'
                    : hasUrl
                    ? 'hover:bg-[#142019] cursor-pointer touch-press'
                    : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {product.logo ? (
                    <div className="w-[32px] h-[32px] min-w-[32px] rounded-[8px] overflow-hidden border border-[#1B2A23] bg-[#142019] flex items-center justify-center shrink-0">
                      <Image
                        src={product.logo}
                        alt={product.name}
                        width={32}
                        height={32}
                        className="w-full h-full object-contain"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="w-[32px] h-[32px] min-w-[32px] rounded-[8px] bg-[#142019] border border-[#1B2A23] flex items-center justify-center text-[13px] font-[600] text-[#E9EFEB] shrink-0">
                      {initial}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-[600] text-[#E9EFEB] leading-tight truncate">
                        {product.name}
                      </span>
                    </div>
                    {hasDesc && (
                      <p className="text-[12px] font-[400] text-[#8B9B93] leading-normal truncate">
                        {product.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex items-center pl-2">
                  {isCurrent ? (
                    <span className="text-[11px] font-mono font-[500] text-[#B8E63A] border border-[#B8E63A]/40 bg-[#B8E63A]/[0.08] px-2 py-0.5 rounded-full whitespace-nowrap">
                      You are here
                    </span>
                  ) : hasUrl ? (
                    <ArrowUpRight className="w-4 h-4 text-[#B8E63A]" strokeWidth={1.7} />
                  ) : hasDesc ? (
                    <ChevronRight className="w-4 h-4 text-[#5E6F67]" strokeWidth={1.7} />
                  ) : null}
                </div>
              </div>
            );

            if (hasUrl && !isCurrent) {
              return (
                <a
                  key={product.name}
                  href={product.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${product.name}`}
                  className="block focus-visible:outline-2 focus-visible:outline-[#B8E63A] focus-visible:outline-offset-[-2px]"
                >
                  {rowContent}
                </a>
              );
            }

            return (
              <div key={product.name}>
                {rowContent}
              </div>
            );
          })}
        </div>
      </section>

      {/* Find us: Single row of 40px icon buttons, evenly spaced */}
      {activeSocials.length > 0 && (
        <section className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-[600] text-[#E9EFEB]">
              Find us
            </h2>
            {creators.social.handle && (
              <span className="text-[12px] font-mono font-[500] text-[#B8E63A]">
                @{creators.social.handle}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-1.5 sm:justify-start sm:gap-2.5">
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
        </section>
      )}

      {/* Contact us button (Only rendered if email is non-empty) */}
      {creators.social.email && (
        <div className="pt-1">
          <a
            href={`mailto:${creators.social.email}`}
            className="w-full h-[42px] rounded-[12px] bg-[#B8E63A] hover:bg-[#c8ee47] text-[#0A0F0D] font-[600] text-[13px] flex items-center justify-center gap-2 transition-colors touch-press focus-visible:outline-2 focus-visible:outline-[#B8E63A]"
          >
            <Mail className="w-4 h-4" strokeWidth={1.7} />
            <span>Contact us</span>
          </a>
        </div>
      )}

      {/* Footer disclaimer line separated by hairline */}
      <footer className="pt-3 border-t border-[#1B2A23] text-left">
        <p className="text-[11px] font-[400] text-[#5E6F67] leading-relaxed">
          Calibrall is a product of Ghreatness Labs. Statistical analysis, not financial or betting advice. 18+. Gamble responsibly.
        </p>
      </footer>
    </div>
  );
}
