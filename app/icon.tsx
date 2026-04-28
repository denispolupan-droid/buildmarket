import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        background: '#0F172A',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '6px',
      }}
    >
      <div
        style={{
          color: '#4880B8',
          fontSize: '22px',
          fontWeight: 900,
          letterSpacing: '-1px',
          fontFamily: 'sans-serif',
        }}
      >
        F
      </div>
    </div>,
    { ...size }
  );
}
