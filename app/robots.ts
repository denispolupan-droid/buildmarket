import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/cart', '/account', '/admin', '/login', '/register', '/order-success', '/invoice'],
      },
    ],
    sitemap: 'https://fixline.com.ua/sitemap.xml',
  };
}
