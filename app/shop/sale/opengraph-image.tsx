import { ImageResponse } from 'next/og';
import fs from 'fs';
import path from 'path';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  const logoBuffer = fs.readFileSync(path.join(process.cwd(), 'public', 'fixline-logo.png'));
  const logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;

  return new ImageResponse(
    <div style={{
      background: 'linear-gradient(160deg, #1E293B 0%, #3B1A1A 100%)',
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '52px 60px',
      fontFamily: 'sans-serif',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Red orb top-right */}
      <div style={{
        position: 'absolute', top: '-100px', right: '-80px',
        width: '420px', height: '420px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(239,68,68,0.3) 0%, transparent 70%)',
        display: 'flex',
      }} />
      <div style={{
        position: 'absolute', bottom: '-80px', left: '-60px',
        width: '340px', height: '340px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 70%)',
        display: 'flex',
      }} />

      {/* Badge */}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'rgba(239,68,68,0.25)',
        border: '1px solid rgba(239,68,68,0.4)',
        borderRadius: '20px',
        padding: '8px 20px',
        width: 'fit-content',
        fontSize: '16px', fontWeight: 600, color: '#FCA5A5',
      }}>
        Спецпропозиції
      </div>

      {/* Title */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        flex: 1, justifyContent: 'center', gap: '16px',
      }}>
        <div style={{
          fontSize: '72px', fontWeight: 900, color: '#ffffff',
          lineHeight: 1.1, letterSpacing: '-1.5px',
          display: 'flex', alignItems: 'center', gap: '24px',
        }}>
          🔥 Акційні товари
        </div>
        <div style={{
          fontSize: '24px', fontWeight: 500,
          color: 'rgba(255,255,255,0.5)',
          display: 'flex',
        }}>
          Будівельна хімія зі знижкою · Від 1 одиниці
        </div>
      </div>

      {/* Bottom */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
