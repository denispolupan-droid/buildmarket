import { ImageResponse } from 'next/og';

// Та сама іконка, що в app/icon.tsx, але 180×180 без скруглення: iOS сам
// заокруглює apple-touch-icon, а без цього файлу браузер на iPhone робить
// знімок сторінки замість логотипа при додаванні на екран.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{
      background: '#1E3A5F',
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'flex-start', justifyContent: 'center',
      padding: '40px 44px',
    }}>
      {[
        { w: '96px', color: '#4880B8' },
        { w: '68px', color: '#7EB8E8' },
        { w: '44px', color: '#7EB8E8' },
      ].map((bar, i) => (
        <div key={i} style={{
          width: bar.w, height: '22px',
          background: bar.color,
          borderRadius: '11px',
          marginBottom: i < 2 ? '16px' : '0',
        }} />
      ))}
    </div>,
    { ...size }
  );
}
