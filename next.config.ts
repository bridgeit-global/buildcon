import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium-min"],
  outputFileTracingIncludes: {
    "/api/crm/": ["./node_modules/playwright-core/browsers.json"],
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
