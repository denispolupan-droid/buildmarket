import { ImageResponse } from 'next/og';
import fs from 'fs';
import path from 'path';
import { getProductBySku, getProductBySlug } from '../../../lib/supabase';
import { retailPrice } from '../../../lib/seo/meta';

// Спільний рендер og-картки товару для uk- і ru-роутів opengraph-image.
// Ціна — РОЗДРІБНА (як для гостя на сторінці та в Product JSON-LD): раніше
// сюди потрапляла price_unit — оптова, схована на сайті за логіном, але
// публічна в прев'ю будь-якого репосту.

export const OG_SIZE = { width: 1200, height: 630 };

const TAGLINE = {
  uk: 'fixline.com.ua — професійна будівельна хімія',
  ru: 'fixline.com.ua — профессиональная строительная химия',
} as const;

export async function productOgImage(params: Promise<{ id: string }>, lang: 'uk' | 'ru') {
  const { id } = await params;
  // id — це ЧПУ-слаг або (старі URL) SKU
  const product = (await getProductBySlug(id)) ?? (await getProductBySku(id));

  const logoBuffer = fs.readFileSync(path.join(process.cwd(), 'public', 'fixline-logo.png'));
  const logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;

  const localName = product
    ? (lang === 'ru' ? ((product as { name_ru?: string | null }).name_ru ?? product.name) : product.name)
    : null;
  // Бренд і фасовку не дублюємо, якщо вони вже в назві («Антисептик Lotus, 5 л»)
  let name = 'Товар';
  if (product && localName) {
    name = localName.toLowerCase().includes(product.brand.toLowerCase()) ? localName : `${product.brand} ${localName}`;
    if (product.volume && !name.toLowerCase().includes(product.volume.toLowerCase())) name += ` ${product.volume}`;
  }
  const price = product ? retailPrice(product) : null;

  return new ImageResponse(
    <div style={{
      background: 'linear-gradient(160deg, #1E293B 0%, #243F6B 100%)',
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '52px 60px',
      fontFamily: 'sans-serif',
    }}>
      {/* Top — logo */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoBase64} alt="FIXLINE" style={{ height: '48px', width: 'auto', objectFit: 'contain', objectPosition: 'left' }} />

      {/* Middle — product name + price */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '52px', fontWeight: 900, color: '#fff', lineHeight: 1.1, letterSpacing: '-1px' }}>
          {name}
        </div>
        {price != null && (
          // display: flex обов'язковий: {price} + ' грн' — два вузли, Satori
          // без явного display падає з «failed to pipe response»
          <div style={{ display: 'flex', fontSize: '36px', fontWeight: 700, color: '#4880B8' }}>
            {price} грн
          </div>
        )}
      </div>

      {/* Bottom — tagline */}
      <div style={{ fontSize: '18px', color: 'rgba(255,255,255,0.3)', display: 'flex' }}>
        {TAGLINE[lang]}
      </div>
    </div>,
    { ...OG_SIZE }
  );
}
