import SettingsTabs from './SettingsTabs';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '32px 36px 64px', maxWidth: '640px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 16px' }}>
        Налаштування
      </h1>
      <SettingsTabs />
      <div style={{ marginTop: '24px' }}>
        {children}
      </div>
    </div>
  );
}
