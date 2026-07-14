import type { NextConfig } from "next";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',  value: 'on' },
  { key: 'X-Frame-Options',         value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options',  value: 'nosniff' },
  { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',      value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.novaposhta.ua",
      "frame-src blob: 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdfkit', 'sharp'],
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
    localPatterns: [
      { pathname: '/img/**' },
    ],
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
      {
        source: '/shop',
        has: [{ type: 'query', key: 'sale', value: '1' }],
        destination: '/shop/sale',
        permanent: true,
      },
      { source: '/shop/ridki-tsvyakhy', destination: '/shop/klei-dlya-plytky', permanent: true },
      { source: '/ru/shop/ridki-tsvyakhy', destination: '/ru/shop/klei-dlya-plytky', permanent: true },
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
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
