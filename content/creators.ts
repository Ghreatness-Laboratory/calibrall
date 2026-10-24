export interface CompanyInfo {
  name: string;
  tagline: string;
  descriptor: string;
  description: string;
  founded: string;
  location: string;
  website: string;
  logo: string;
}

export interface WhatWeDoItem {
  icon: string;
  title: string;
  description: string;
}

export interface TeamMember {
  name: string;
  role: string;
  bio: string;
  photo?: string;
  socials?: Record<string, string>;
}

export interface ProductItem {
  name: string;
  description: string;
  url: string;
  logo?: string;
  status?: "live" | "beta" | "coming-soon";
  current?: boolean;
}

export interface SocialLinks {
  handle: string;
  x: string;
  instagram: string;
  linkedin: string;
  telegram: string;
  github: string;
  youtube: string;
  tiktok: string;
  website: string;
  email: string;
}

export interface CreatorsConfig {
  company: CompanyInfo;
  audiences: string[];
  whatWeDo: WhatWeDoItem[];
  team: TeamMember[];
  products: ProductItem[];
  social: SocialLinks;
}

export const creators: CreatorsConfig = {
  company: {
    name: "Ghreatness Labs",
    tagline: "One platform. Multiple ventures. Infinite possibilities.",
    descriptor: "Holding Group for Technology-Driven Brands. IT Solutions Provider for Growing Businesses.",
    description:
      "Ghreatness Labs is a technology holding group and IT solutions provider on a mission to simplify digital transformation. Through our unified Platform-as-a-Service (PaaS) model, we give businesses access to a full suite of digital and IT services under one roof: scalable, seamless, and built for long-term growth. We also incubate and scale technology-driven brands, providing shared infrastructure, strategic leadership, and forward-thinking execution that turns early-stage ventures into high-impact companies.",
    founded: "2024",
    location: "",
    website: "",
    logo: "",
  },
  audiences: ["Tech startups", "Small businesses", "Companies"],
  whatWeDo: [
    { icon: "layers", title: "Platform-as-a-Service",
      description: "A unified PaaS model giving businesses a full suite of digital and IT services under one roof, scalable, seamless and built for long-term growth." },
    { icon: "server-cog", title: "IT solutions for growing businesses",
      description: "Technology services for startups, small businesses and companies that want to simplify digital transformation." },
    { icon: "rocket", title: "Venture incubation",
      description: "We incubate and scale technology-driven brands with shared infrastructure, strategic leadership and forward-thinking execution." },
  ],
  team: [], // later: { name, role, bio, photo, socials }
  // Add description, url, logo and status per product when ready.
  products: [
    { name: "Calibrall", description: "Football analytics with Dixon-Coles probabilities, expected value and an audited track record.", url: "https://calibrall.vercel.app", current: true },
    { name: "Gbedu Games", description: "", url: "" },
    { name: "FragNaija", description: "A digital ecosystem for esports athletes.", url: "" },
    { name: "Frag Africa", description: "", url: "" },
    { name: "Univyx", description: "A private university hub and social platform.", url: "" },
    { name: "Univyx Arena", description: "", url: "" },
    { name: "MisplaceMe", description: "", url: "" },
    { name: "Sonariq Sounds", description: "", url: "" },
    { name: "Athlegame Esports", description: "", url: "" },
  ],
  social: {
    handle: "ghreatnesslabs",
    x: "ghreatnesslabs", instagram: "ghreatnesslabs", linkedin: "ghreatnesslabs",
    telegram: "ghreatnesslabs", github: "ghreatnesslabs", youtube: "ghreatnesslabs",
    tiktok: "ghreatnesslabs", website: "", email: "",
  },
};

export function getSocialUrl(platform: keyof Omit<SocialLinks, 'handle' | 'website' | 'email'>, handle: string): string {
  if (!handle) return '';
  switch (platform) {
    case 'x':
      return `https://x.com/${handle}`;
    case 'instagram':
      return `https://instagram.com/${handle}`;
    case 'linkedin':
      return `https://linkedin.com/company/${handle}`;
    case 'telegram':
      return `https://t.me/${handle}`;
    case 'github':
      return `https://github.com/${handle}`;
    case 'youtube':
      return `https://youtube.com/@${handle}`;
    case 'tiktok':
      return `https://tiktok.com/@${handle}`;
    default:
      return '';
  }
}
