import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium-min"],
  // playwright-core@1.60+ loads browsers.json via dynamic require; @vercel/nft won't
  // trace it unless we include it explicitly. Use hoisted node_modules (.npmrc) so
  // this path is a real file, not a pnpm symlink (symlinks break Vercel deploy).
  outputFileTracingIncludes: {
    "/api/crm/**": ["./node_modules/playwright-core/browsers.json"],
  },
  turbopack: {
    root: import.meta.dirname,
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    return config;
  },
  async redirects() {
    return [
      {
        source: "/crm/projects",
        destination: "/crm/project",
        permanent: true
      },
      {
        source: "/crm/inquiry/pipeline/:inquiryId",
        destination: "/crm/inquiry/new?inquiry=:inquiryId",
        permanent: false
      }
    ];
  },
};

export default nextConfig;
