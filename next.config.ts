import type { NextConfig } from "next";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'boaztnparrdoeknajprn.supabase.co',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/shop',
        has: [{ type: 'query', key: 'category', value: '(?<category>.+)' }],
        destination: '/shop/:category',
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/img/:path*',
        destination: `${SUPABASE_URL}/storage/v1/object/public/:path*`,
      },
    ];
  },
};

export default nextConfig;
