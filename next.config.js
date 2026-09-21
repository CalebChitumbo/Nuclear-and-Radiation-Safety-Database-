// The service worker (app/sw.ts) that lets the app open at a border post with
// no signal. Built on `next build` only — in development every request goes
// to the network, so a change is never masked by a cached page.
const withSerwist = require("@serwist/next").default({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

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

module.exports = withSerwist(nextConfig);
