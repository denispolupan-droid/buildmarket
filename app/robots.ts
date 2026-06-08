import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/_next/',
          '/admin/',
          '/cabinet/',
          '/account/',
          '/cart',
          '/order-success',
          '/invoice/',
          '/ru/login',
          '/login',
          '/register',
          '/api/',
        ],
      },
    ],
    sitemap: 'https://fixline.com.ua/sitemap.xml',
  };
}
