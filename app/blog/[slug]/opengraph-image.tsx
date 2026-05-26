import { ImageResponse } from 'next/og';
import fs from 'fs';
import path from 'path';
import { getArticle } from '../../../lib/blog';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticle(slug);

  const logoBuffer = fs.readFileSync(path.join(process.cwd(), 'public', 'fixline-logo.png'));
  const logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;

  const title = article?.title ?? 'Блог FIXLINE';
  const category = article?.category ?? 'Поради';

  return new ImageResponse(
    <div style={{
      background: 'linear-gradient(160deg, #1E293B 0%, #243F6B 100%)',
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '52px 60px',
      fontFamily: 'sans-serif',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Orb top-right */}
      <div style={{
        position: 'absolute', top: '-100px', right: '-80px',
        width: '420px', height: '420px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(72,128,184,0.25) 0%, transparent 70%)',
        display: 'flex',
      }} />
      {/* Orb bottom-left */}
      <div style={{
        position: 'absolute', bottom: '-80px', left: '-60px',
        width: '340px', height: '340px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(14,165,233,0.15) 0%, transparent 70%)',
        display: 'flex',
      }} />

      {/* Category badge */}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'rgba(72,128,184,0.25)',
        border: '1px solid rgba(72,128,184,0.4)',
        borderRadius: '20px',
        padding: '8px 20px',
        alignSelf: 'flex-start',
        fontSize: '16px', fontWeight: 600, color: '#93C5FD',
      }}>
        {category}
      </div>

      {/* Title */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        gap: '0', flex: 1, justifyContent: 'center',
      }}>
        <div style={{
          fontSize: title.length > 50 ? '44px' : '52px',
          fontWeight: 800, color: '#ffffff',
          lineHeight: 1.2, letterSpacing: '-0.5px',
          maxWidth: '900px',
        }}>
          {title}
        </div>
      </div>

      {/* Bottom row */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoBase64} alt="FIXLINE" style={{ height: '36px', width: 'auto', objectFit: 'contain', objectPosition: 'left' }} />
        <div style={{ fontSize: '16px', color: 'rgba(255,255,255,0.3)', display: 'flex' }}>
          fixline.com.ua
        </div>
      </div>
    </div>,
    { ...size }
  );
}
