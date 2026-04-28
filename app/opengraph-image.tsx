import { ImageResponse } from 'next/og';
import fs from 'fs';
import path from 'path';

export const alt = 'FIXLINE — професійна будівельна хімія';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  const logoBuffer = fs.readFileSync(path.join(process.cwd(), 'public', 'fixline-logo.png'));
  const logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%',
        background: 'linear-gradient(160deg, #1E293B 0%, #243F6B 100%)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 40,
        fontFamily: 'sans-serif',
      }}>
        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoBase64} alt="FIXLINE" style={{ height: '80px', width: 'auto', objectFit: 'contain' }} />

        <div style={{
          fontSize: 30, fontWeight: 500, color: '#94A3B8',
          textAlign: 'center', maxWidth: 700, display: 'flex',
        }}>
          Професійна будівельна хімія — гуртом та в роздріб
        </div>

        <div style={{ display: 'flex', gap: 24 }}>
          {['Герметики', 'Монтажні піни', 'Клеї', 'Ґрунтовки'].map(tag => (
            <div key={tag} style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8, padding: '8px 18px',
              fontSize: 18, color: '#CBD5E1', display: 'flex',
            }}>
              {tag}
            </div>
          ))}
        </div>

        <div style={{ position: 'absolute', bottom: 40, fontSize: 18, color: '#475569', display: 'flex' }}>
          fixline.com.ua
        </div>
      </div>
    ),
    { ...size }
  );
}
