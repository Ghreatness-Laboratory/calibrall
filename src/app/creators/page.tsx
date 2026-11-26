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
  ChevronLeft,
  Mail,
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
    .map((p) => {
      const handle = creators.social[p.key];
      const url = getSocialUrl(p.key, handle);
      return { ...p, handle, url };
    })
    .filter((item) => Boolean(item.handle && item.url));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: creators.company.name,
    foundingDate: creators.company.founded || undefined,
    description: creators.company.description,
    url: 'https://calibrall.vercel.app/creators',
    logo: creators.company.logo || undefined,
    sameAs: activeSocials.map((s) => s.url),
    brand: creators.products
      .filter((p) => Boolean(p.name))
      .map((p) => ({
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

  const iconTints = ['text-[var(--accent)]', 'text-[var(--info)]', 'text-[var(--medium)]'];

  return (
    <div className="max-w-xl mx-auto space-y-4 py-2 min-w-0 pb-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 min-h-[44px] text-[12.5px] font-[500] text-[var(--text-2)] hover:text-[var(--text)] transition-colors touch-press"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Home</span>
        </Link>
      </div>

      <header className="space-y-1 text-left">
        <h1 className="font-display text-[26px] font-[700] leading-[1.18] text-[var(--text)] tracking-[-0.02em]">
          Built by Ghreatness Labs
        </h1>
        <p className="text-[12.5px] sm:text-[13px] font-[400] leading-[1.5] text-[var(--text-2)] max-w-xl">
          Calibrall is a product of Ghreatness Labs, a technology holding group that builds and scales technology-driven brands.
        </p>
      </header>

      {/* Company card */}
      <section className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3.5">
        <div className="flex items-center gap-3 min-w-0">
          {creators.company.logo ? (
            <div className="w-[40px] h-[40px] rounded-[12px] overflow-hidden border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-center shrink-0">
              <Image
                src={creators.company.logo}
                alt={creators.company.name}
                width={40}
                height={40}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="w-[40px] h-[40px] rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-center text-[var(--accent)] shrink-0">
              <Building2 className="w-[18px] h-[18px]" strokeWidth={1.7} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[15px] font-[600] text-[var(--text)] leading-tight">
              {creators.company.name}
            </h2>
            <p className="text-[12px] text-[var(--text-2)] leading-tight mt-0.5">
              Holding group for technology-driven brands
            </p>
          </div>
        </div>

        {creators.company.description && (
          <p className="text-[12.5px] text-[var(--text-2)] leading-[1.55]">
            {creators.company.description}
          </p>
        )}

        {creators.audiences && creators.audiences.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {creators.audiences.map((audience) => (
              <span
                key={audience}
                className="border border-[var(--line)] px-2.5 py-0.5 rounded-full text-[11px] font-[500] text-[var(--text-2)] bg-[var(--surface-2)]"
              >
                {audience}
              </span>
            ))}
          </div>
        )}

        <div className="border-t border-[var(--line)] pt-3 grid grid-cols-3 divide-x divide-[var(--line)] text-center">
          <div className="px-1">
            <div className="font-display text-[14px] font-[700] text-[var(--text)] tabular-nums">2024</div>
            <div className="text-[11px] text-[var(--text-2)] mt-0.5">Established</div>
          </div>
          <div className="px-1">
            <div className="font-display text-[14px] font-[700] text-[var(--text)] tabular-nums">9</div>
            <div className="text-[11px] text-[var(--text-2)] mt-0.5">Products</div>
          </div>
          <div className="px-1">
            <div className="font-display text-[14px] font-[700] text-[var(--text)] tabular-nums">3</div>
            <div className="text-[11px] text-[var(--text-2)] mt-0.5">Services</div>
          </div>
        </div>
      </section>

      {creators.company.tagline && (
        <p className="font-display text-[14px] font-[600] text-[var(--accent)] leading-relaxed">
          &ldquo;{creators.company.tagline}&rdquo;
        </p>
      )}

      {creators.whatWeDo && creators.whatWeDo.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-[14px] font-[600] text-[var(--text)]">What we do</h2>

          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] divide-y divide-[var(--line)] overflow-hidden">
            {creators.whatWeDo.map((item, index) => {
              const IconComponent = getWhatWeDoIcon(item.icon);
              const tint = iconTints[index % iconTints.length];
              return (
                <div key={item.title} className="p-3.5 flex items-start gap-3">
                  <div
                    className={`w-[38px] h-[38px] rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center shrink-0 ${tint}`}
                  >
                    <IconComponent className="w-[18px] h-[18px]" strokeWidth={1.7} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[13.5px] font-[600] text-[var(--text)] leading-tight">
                      {item.title}
                    </h3>
                    <p className="text-[12px] text-[var(--text-2)] leading-[1.5] mt-0.5 line-clamp-2">
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {creators.team && creators.team.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-[14px] font-[600] text-[var(--text)]">About the team</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {creators.team.map((member) => (
              <div
                key={member.name}
                className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-2"
              >
                <div className="flex items-center gap-3">
                  {member.photo ? (
                    <div className="w-[48px] h-[48px] rounded-full overflow-hidden shrink-0">
                      <Image
                        src={member.photo}
                        alt={member.name}
                        width={48}
                        height={48}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="w-[48px] h-[48px] rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--accent)] text-[14px] font-[600] flex items-center justify-center shrink-0">
                      {member.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-[600] text-[var(--text)] truncate">{member.name}</h3>
                    <p className="text-[12px] text-[var(--text-2)] truncate">{member.role}</p>
                  </div>
                </div>
                {member.bio && (
                  <p className="text-[12px] text-[var(--text-2)] leading-[1.5]">{member.bio}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* More from us */}
      <section id="more-from-us" className="space-y-2 scroll-mt-20">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[14px] font-[600] text-[var(--text)]">More from us</h2>
          <span className="text-[11px] font-medium text-[var(--text-2)]">
            {creators.products.length} products
          </span>
        </div>
        <p className="text-[12px] text-[var(--text-2)]">
          Brands and platforms built and scaled under Ghreatness Labs.
        </p>

        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] overflow-hidden divide-y divide-[var(--line)]">
          {creators.products.map((product) => {
            const hasUrl = Boolean(product.url);
            const hasDesc = Boolean(product.description);
            const isCurrent = Boolean(product.current);
            const initial = product.name ? product.name.charAt(0) : '';

            const rowContent = (
              <div
                className={`min-h-[52px] px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                  isCurrent
                    ? 'bg-[var(--accent-soft)]'
                    : hasUrl
                    ? 'hover:bg-[var(--surface-2)] cursor-pointer touch-press'
                    : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {product.logo ? (
                    <div className="w-[34px] h-[34px] rounded-[10px] overflow-hidden border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-center shrink-0">
                      <Image
                        src={product.logo}
                        alt={product.name}
                        width={34}
                        height={34}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="w-[34px] h-[34px] rounded-[10px] bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-[13px] font-[600] text-[var(--text)] shrink-0">
                      {initial}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <span className="text-[13.5px] font-[600] text-[var(--text)] leading-tight truncate block">
                      {product.name}
                    </span>
                    {hasDesc && (
                      <p className="text-[12px] text-[var(--text-2)] leading-normal truncate">
                        {product.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex items-center pl-2">
                  {isCurrent ? (
                    <span className="text-[11px] font-medium text-[var(--accent)] border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-2.5 py-0.5 rounded-full whitespace-nowrap">
                      You are here
                    </span>
                  ) : hasUrl ? (
                    <ArrowUpRight className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.7} />
                  ) : hasDesc ? (
                    <ChevronRight className="w-4 h-4 text-[var(--text-3)]" strokeWidth={1.7} />
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
                  className="block"
                >
                  {rowContent}
                </a>
              );
            }

            return <div key={product.name}>{rowContent}</div>;
          })}
        </div>
      </section>

      {activeSocials.length > 0 && (
        <section className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[14px] font-[600] text-[var(--text)]">Find us</h2>
            {creators.social.handle && (
              <span className="text-[12px] font-medium text-[var(--accent)]">
                @{creators.social.handle}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeSocials.map((platform) => (
              <a
                key={platform.key}
                href={platform.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Ghreatness Labs on ${platform.name}`}
                className="w-[44px] h-[44px] rounded-[12px] border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)] flex items-center justify-center transition-colors touch-press"
              >
                <SocialIcon platform={platform.key} size={18} />
              </a>
            ))}
          </div>
        </section>
      )}

      {creators.social.email && (
        <div className="pt-1">
          <a
            href={`mailto:${creators.social.email}`}
            className="w-full min-h-[44px] rounded-[12px] bg-[var(--accent-fill)] hover:opacity-90 text-[var(--accent-ink)] font-[600] text-[13px] flex items-center justify-center gap-2 transition-opacity touch-press"
          >
            <Mail className="w-4 h-4" strokeWidth={1.7} />
            <span>Contact us</span>
          </a>
        </div>
      )}

      <footer className="pt-3 border-t border-[var(--line)] text-left">
        <p className="text-[11px] text-[var(--text-3)] leading-relaxed">
          Calibrall is a product of Ghreatness Labs. Statistical analysis, not financial or betting advice. 18+. Gamble responsibly.
        </p>
      </footer>
    </div>
  );
}
