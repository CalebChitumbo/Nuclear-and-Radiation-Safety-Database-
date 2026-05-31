/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lint runs as a dedicated CI step (and locally via `npm run lint`), so we
  // don't let it block production builds/deploys on Vercel. TypeScript type
  // errors still fail the build.
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    typedRoutes: false,
  },
};

module.exports = nextConfig;
