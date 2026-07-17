import { ImageResponse } from 'next/og';
import fs from 'fs';
import path from 'path';
import { getProductBySku, getProductBySlug } from '../../../lib/supabase';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // id — це ЧПУ-слаг або (старі URL) SKU
  const product = (await getProductBySlug(id)) ?? (await getProductBySku(id));

  const logoBuffer = fs.readFileSync(path.join(process.cwd(), 'public', 'fixline-logo.png'));
  const logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;

  const name = product ? `${product.brand} ${product.name}${product.volume ? ' ' + product.volume : ''}` : 'Товар';
  const price = product?.stock?.price_unit;

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
        {price && (
          <div style={{ fontSize: '36px', fontWeight: 700, color: '#4880B8' }}>
            {price} грн
          </div>
        )}
      </div>

      {/* Bottom — tagline */}
      <div style={{ fontSize: '18px', color: 'rgba(255,255,255,0.3)', display: 'flex' }}>
        fixline.com.ua — професійна будівельна хімія
      </div>
    </div>,
    { ...size }
  );
}
