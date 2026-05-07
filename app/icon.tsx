import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div style={{
      background: '#1E3A5F',
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'flex-start', justifyContent: 'center',
      padding: '7px 8px',
      borderRadius: '6px',
    }}>
      {/* Three rounded bars — icon mark */}
      {[
        { w: '17px', color: '#4880B8' },
        { w: '12px', color: '#7EB8E8' },
        { w: '8px',  color: '#7EB8E8' },
      ].map((bar, i) => (
        <div key={i} style={{
          width: bar.w, height: '4px',
          background: bar.color,
          borderRadius: '2px',
          marginBottom: i < 2 ? '3px' : '0',
        }} />
      ))}
    </div>,
    { ...size }
  );
}
