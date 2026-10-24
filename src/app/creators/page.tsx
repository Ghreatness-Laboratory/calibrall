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
    'bg-[#b8e63a]/15 text-[#b8e63a]',
    'bg-[#5eb6e8]/15 text-[#5eb6e8]',
    'bg-[#e3b341]/15 text-[#e3b341]',
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6 sm:space-y-7 py-2 min-w-0 pb-12">
      {/* Structured Data (JSON-LD) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Header section */}
      <header className="space-y-1.5 text-left pb-4 border-b-[0.5px] border-white/[0.08]">
        <span className="text-[11px] font-[500] text-[#b8e63a] block">
          Meet the creators
        </span>
        <h1 className="text-[22px] font-[500] leading-[1.25] text-[#e8efe9] text-left">
          Built by Ghreatness Labs
        </h1>
        <p className="text-[13px] font-[400] leading-[1.65] text-[#8fa69a] text-left max-w-xl">
          Calibrall is a product of Ghreatness Labs, a technology holding group that builds and scales technology-driven brands.
        </p>
      </header>

      {/* Company card */}
      <section className="bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[12px] p-[14px] space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {creators.company.logo ? (
              <div className="w-[44px] h-[44px] min-w-[44px] rounded-[10px] overflow-hidden border-[0.5px] border-white/[0.08] bg-white/[0.06] flex items-center justify-center shrink-0">
                <Image
                  src={creators.company.logo}
                  alt={creators.company.name}
                  width={44}
                  height={44}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="w-[44px] h-[44px] min-w-[44px] rounded-[10px] border-[0.5px] border-white/[0.08] bg-white/[0.06] flex items-center justify-center text-[#8fa69a] shrink-0">
                <Building2 className="w-5 h-5 text-[#b8e63a]" strokeWidth={1.75} />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-[15px] font-[500] text-[#e8efe9] leading-tight truncate">
                {creators.company.name}
              </h2>
              {creators.company.descriptor && (
                <p className="text-[12px] font-[400] text-[#8fa69a] leading-tight mt-1 line-clamp-2">
                  {creators.company.descriptor}
                </p>
              )}
            </div>
          </div>

          {creators.company.founded && (
            <div className="border-[0.5px] border-white/[0.08] px-2 py-0.5 rounded-[4px] font-mono text-[11px] text-[#8fa69a] shrink-0 whitespace-nowrap">
              EST. {creators.company.founded}
            </div>
          )}
        </div>

        {creators.company.description && (
          <p className="text-[13px] font-[400] text-[#8fa69a] leading-[1.65]">
            {creators.company.description}
          </p>
        )}

        {creators.audiences && creators.audiences.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {creators.audiences.map((audience) => (
              <span
                key={audience}
                className="border-[0.5px] border-white/[0.08] px-2.5 py-1 rounded-[6px] text-[11px] font-[400] text-[#8fa69a] bg-[#101713]"
              >
                {audience}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Pull quote */}
      {creators.company.tagline && (
        <div className="py-1 text-left">
          <p className="text-[15px] font-[500] text-[#b8e63a] leading-relaxed">
            &ldquo;{creators.company.tagline}&rdquo;
          </p>
        </div>
      )}

      {/* What we do */}
      {creators.whatWeDo && creators.whatWeDo.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="text-[15px] font-[500] text-[#e8efe9]">
            What we do
          </h2>

          <div className="space-y-2">
            {creators.whatWeDo.map((item, index) => {
              const IconComponent = getWhatWeDoIcon(item.icon);
              const tint = iconTints[index % iconTints.length];
              return (
                <div
                  key={item.title}
                  className="bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[10px] p-3 flex items-start gap-3"
                >
                  <div
                    className={`w-[30px] h-[30px] min-w-[30px] rounded-[7px] flex items-center justify-center shrink-0 mt-0.5 ${tint}`}
                  >
                    <IconComponent className="w-4 h-4" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[13px] font-[500] text-[#e8efe9] leading-tight">
                      {item.title}
                    </h3>
                    <p className="text-[12px] font-[400] text-[#8fa69a] leading-[1.55] mt-1">
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
        <section className="space-y-3">
          <h2 className="text-[15px] font-[500] text-[#e8efe9]">
            About the team
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {creators.team.map((member) => (
              <div
                key={member.name}
                className="bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[10px] p-3.5 space-y-2.5"
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
                    <div className="w-[48px] h-[48px] rounded-full bg-[#1b4332] text-[#b8e63a] font-mono text-[14px] font-[500] flex items-center justify-center shrink-0">
                      {member.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-[500] text-[#e8efe9] truncate">
                      {member.name}
                    </h3>
                    <p className="text-[12px] font-[400] text-[#8fa69a] truncate">
                      {member.role}
                    </p>
                  </div>
                </div>
                {member.bio && (
                  <p className="text-[12px] font-[400] text-[#8fa69a] leading-[1.55]">
                    {member.bio}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* More from us */}
      <section id="more-from-us" className="space-y-2.5 scroll-mt-20">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-[500] text-[#e8efe9]">
            More from us
          </h2>
          <span className="text-[11px] font-mono font-[400] text-[#8fa69a]">
            {creators.products.length} products
          </span>
        </div>
        <p className="text-[12px] font-[400] text-[#8fa69a]">
          Brands and platforms built and scaled under Ghreatness Labs.
        </p>

        {/* ONE grouped card containing rows divided by 0.5px hairlines */}
        <div className="bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[12px] overflow-hidden divide-y divide-white/[0.08]">
          {creators.products.map((product) => {
            const hasUrl = Boolean(product.url);
            const hasDesc = Boolean(product.description);
            const isCurrent = Boolean(product.current);
            const initial = product.name ? product.name.charAt(0) : '';

            // Status chip styling
            let statusBadge = null;
            if (product.status === 'live') {
              statusBadge = (
                <span className="text-[11px] font-[400] border-[0.5px] border-[#b8e63a]/40 bg-[#b8e63a]/10 text-[#b8e63a] px-2 py-0.5 rounded-[4px] shrink-0">
                  live
                </span>
              );
            } else if (product.status === 'beta') {
              statusBadge = (
                <span className="text-[11px] font-[400] border-[0.5px] border-[#e3b341]/40 bg-[#e3b341]/10 text-[#e3b341] px-2 py-0.5 rounded-[4px] shrink-0">
                  beta
                </span>
              );
            } else if (product.status === 'coming-soon') {
              statusBadge = (
                <span className="text-[11px] font-[400] border-[0.5px] border-dashed border-white/20 text-[#8fa69a] px-2 py-0.5 rounded-[4px] shrink-0">
                  coming-soon
                </span>
              );
            }

            const rowContent = (
              <div
                className={`min-h-[48px] px-3.5 py-3 flex items-start justify-between gap-3 transition-colors ${
                  isCurrent
                    ? 'border-l-2 border-l-[#b8e63a] bg-[rgba(184,230,58,0.06)]'
                    : hasUrl
                    ? 'hover:bg-[#151E19]/80 cursor-pointer'
                    : ''
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {product.logo ? (
                    <div className="w-[32px] h-[32px] min-w-[32px] rounded-[8px] overflow-hidden border-[0.5px] border-white/[0.08] bg-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
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
                    <div className="w-[32px] h-[32px] min-w-[32px] rounded-[8px] bg-white/[0.06] flex items-center justify-center text-[13px] font-[500] text-[#e8efe9] shrink-0 mt-0.5">
                      {initial}
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-[500] text-[#e8efe9] leading-tight">
                        {product.name}
                      </span>
                      {statusBadge}
                    </div>
                    {hasDesc && (
                      <p className="text-[12px] font-[400] text-[#8fa69a] leading-[1.6]">
                        {product.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex items-center pl-2 pt-1">
                  {isCurrent ? (
                    <span className="text-[11px] font-mono font-[400] text-[#b8e63a] border-[0.5px] border-[#b8e63a]/40 bg-[#b8e63a]/10 px-2 py-0.5 rounded-[4px] whitespace-nowrap">
                      You are here
                    </span>
                  ) : hasUrl ? (
                    <ArrowUpRight className="w-4 h-4 text-[#b8e63a]" strokeWidth={1.75} />
                  ) : hasDesc ? (
                    <ChevronRight className="w-4 h-4 text-[#8fa69a]" strokeWidth={1.75} />
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
                  className="block focus-visible:outline-2 focus-visible:outline-[#b8e63a] focus-visible:outline-offset-[-2px]"
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

      {/* Find us */}
      {activeSocials.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-[500] text-[#e8efe9]">
              Find us
            </h2>
            {creators.social.handle && (
              <span className="text-[12px] font-mono font-[400] text-[#b8e63a]">
                @{creators.social.handle}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {activeSocials.map((platform) => (
              <a
                key={platform.key}
                href={platform.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Ghreatness Labs on ${platform.name}`}
                className="min-h-[44px] px-3 py-2.5 rounded-[8px] border-[0.5px] border-white/[0.08] bg-[#0f2219] hover:bg-[#151E19] text-[#e8efe9] text-[12px] font-[400] flex items-center gap-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-[#b8e63a]"
              >
                <div className="text-[#8fa69a] shrink-0">
                  <SocialIcon platform={platform.key} size={16} />
                </div>
                <span className="truncate">{platform.name}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Contact us button (Only rendered if email is non-empty) */}
      {creators.social.email && (
        <div>
          <a
            href={`mailto:${creators.social.email}`}
            className="w-full h-[44px] rounded-[8px] bg-[#b8e63a] hover:bg-[#c8ee47] active:bg-[#a5cf30] text-[#0a1812] font-[500] text-[13px] flex items-center justify-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-[#b8e63a]"
          >
            <Mail className="w-4 h-4" />
            <span>Contact us</span>
          </a>
        </div>
      )}

      {/* Footer line */}
      <footer className="pt-4 border-t-[0.5px] border-white/[0.08] text-left">
        <p className="text-[11px] font-[400] text-[#8fa69a] leading-relaxed">
          Calibrall is a product of Ghreatness Labs. Statistical analysis, not financial or betting advice. 18+. Gamble responsibly.
        </p>
      </footer>
    </div>
  );
}
