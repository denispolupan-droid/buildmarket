import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "./components/Header";
import { CartProvider } from "../lib/cart";
import { WishlistProvider } from "../lib/wishlist";
import { ThemeProvider } from "../lib/theme";

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export const metadata: Metadata = {
  title: {
    default: 'FIXLINE — будівельна хімія оптом | B2B платформа',
    template: '%s | FIXLINE',
  },
  description: 'B2B платформа для оптових закупівель будівельної хімії. Герметики, монтажні піни, клеї, рідкі цвяхи. Оптові ціни для дилерів, магазинів та підрядників по всій Україні.',
  metadataBase: new URL('https://fixline.com.ua'),
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
  return (
    <html lang="uk" className={inter.className} suppressHydrationWarning>
      <head><meta name="google" content="notranslate" /></head>
      <body>
        <ThemeProvider>
          <CartProvider>
            <WishlistProvider>
              <Header />
              <main style={{minHeight:'100vh'}}>
                {children}
              </main>
            </WishlistProvider>
          </CartProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
