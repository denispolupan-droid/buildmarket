import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import path from 'path';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  // Спробуємо завантажити логотип
  let logoSrc: string | null = null;
  try {
    const buf = readFileSync(path.join(process.cwd(), 'public', 'fixline-logo.png'));
    logoSrc = `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    logoSrc = null;
  }

  return new ImageResponse(
    <div
      style={{
        background: '#0F172A',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '4px',
      }}
    >
      {logoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoSrc}
          alt="FIXLINE"
          style={{ width: '28px', height: '28px', objectFit: 'contain' }}
        />
      ) : (
        /* Fallback — три лінії як у логотипі */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              style={{
                width: i === 1 ? '16px' : '20px',
                height: '3px',
                background: '#4880B8',
                borderRadius: '2px',
              }}
            />
          ))}
        </div>
      )}
    </div>,
    { ...size }
  );
}
