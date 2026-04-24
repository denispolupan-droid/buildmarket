import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'FIXLINE — професійна будівельна хімія';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%',
        background: 'linear-gradient(160deg, #0F172A 0%, #1E3A5F 100%)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 32,
        fontFamily: 'sans-serif',
      }}>
        <div style={{
          fontSize: 72, fontWeight: 900, color: '#fff',
          letterSpacing: '-2px', display: 'flex',
        }}>
          FIXLINE
        </div>
        <div style={{
          fontSize: 32, fontWeight: 600, color: '#94A3B8',
          textAlign: 'center', maxWidth: 700, display: 'flex',
        }}>
          Професійна будівельна хімія — гуртом та в роздріб
        </div>
        <div style={{
          display: 'flex', gap: 24, marginTop: 8,
        }}>
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
        <div style={{
          position: 'absolute', bottom: 40,
          fontSize: 20, color: '#475569', display: 'flex',
        }}>
          fixline.com.ua
        </div>
      </div>
    ),
    { ...size }
  );
}
