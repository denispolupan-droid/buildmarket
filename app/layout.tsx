import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "./components/Header";
import ChatWidget from "./components/ChatWidget";
import GoogleAnalytics from "./components/GoogleAnalytics";
import { CartProvider } from "../lib/cart";
import { WishlistProvider } from "../lib/wishlist";
import { ThemeProvider } from "../lib/theme";

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export const metadata: Metadata = {
  title: {
    default: 'FIXLINE — будівельна хімія оптом | B2B платформа',
    template: '%s | FIXLINE',
  },
  description: 'B2B платформа для оптових закупівель будівельної хімії. Герметики, монтажні піни, клеї, рідкі цвяхи. Оптові ціни для дилерів та підрядників. Строительная химия оптом по Украине.',
  keywords: ['будівельна хімія', 'строительная химия', 'герметики', 'монтажна піна', 'монтажная пена', 'клеї оптом', 'клеи оптом', 'будівельна хімія оптом', 'строительная химия оптом', 'Україна', 'Украина'],
  metadataBase: new URL('https://fixline.com.ua'),
  alternates: {
    canonical: 'https://fixline.com.ua',
    languages: {
      'uk': 'https://fixline.com.ua',
      'ru': 'https://fixline.com.ua/ru',
      'x-default': 'https://fixline.com.ua',
    },
  },
  openGraph: {
    siteName: 'FIXLINE',
    locale: 'uk_UA',
    type: 'website',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'FIXLINE — професійна будівельна хімія' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FIXLINE — будівельна хімія оптом',
    description: 'Герметики, монтажні піни, клеї — гуртом та в роздріб по всій Україні.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Раніше мову визначали через await headers() — це переводило КОРЕНЕВИЙ layout (а отже
  // весь сайт) у dynamic rendering і обнуляло ISR. Тепер SSR ставить lang="uk" статично,
  // а блокуючий head-скрипт нижче коригує lang для /ru ще до першого рендера.
  return (
    <html lang="uk" className={inter.className} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://boaztnparrdoeknajprn.supabase.co" />
        <link rel="dns-prefetch" href="https://boaztnparrdoeknajprn.supabase.co" />
        <link rel="preconnect" href="https://pan2.uk" />
        <link rel="dns-prefetch" href="https://pan2.uk" />
        {/* Blocking script — applies theme + lang BEFORE first paint, eliminates white flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('theme') ||
              (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
            document.documentElement.setAttribute('data-theme', t);
            if (t === 'dark') document.documentElement.style.background = '#252B38';
            document.documentElement.lang = location.pathname.indexOf('/ru') === 0 ? 'ru' : 'uk';
          } catch(e) {}
        ` }} />
      </head>
      <body>
        <Suspense fallback={null}>
          <GoogleAnalytics />
        </Suspense>
        <ThemeProvider>
          <CartProvider>
            <WishlistProvider>
              <Header />
              <main style={{minHeight:'100vh'}}>
                {children}
              </main>
              <ChatWidget />
            </WishlistProvider>
          </CartProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
