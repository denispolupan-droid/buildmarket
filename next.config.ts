import type { NextConfig } from "next";

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? '';

// 'unsafe-eval' потрібен лише dev-режиму (HMR); у production прибираємо його, щоб
// не послаблювати захист CSP від XSS.
const isDev = process.env.NODE_ENV === 'development';
const scriptSrc = `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`;

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
      scriptSrc,
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
  experimental: {
    // Під час білда БД одночасно обслуговує пре-рендер сотень сторінок і живий
    // трафік (обхід Google) — разовий statement timeout на одному запиті ронив
    // ВЕСЬ деплой. Повторюємо невдалу генерацію сторінки до 2 разів, перш ніж
    // валити білд; на рантайм не впливає (тільки збірка).
    staticGenerationRetryCount: 2,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
    // Broad catch-all rather than enumerating each public/ subfolder (blog/covers,
    // brands, images, img/products) — missing just one silently breaks its images,
    // as happened with blog covers when this only allowlisted /img/**. There's no
    // SSRF concern here since every local path is an asset we control; remotePatterns
    // below is what actually restricts external hosts.
    localPatterns: [
      { pathname: '/**' },
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pan2.uk',
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
      // Every image URL on the site is "/img/products/...", because the old Supabase
      // Storage bucket was named "products" — R2's public URL is already scoped to a
      // single bucket, so "products" is dropped here rather than re-keying the R2
      // objects (which were migrated 1:1 without that prefix) to match.
      {
        source: '/img/products/:path*',
        destination: `${R2_PUBLIC_URL}/:path*`,
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
