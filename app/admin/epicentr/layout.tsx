import MarketplaceTabs from '../components/MarketplaceTabs';

const TABS = [
  { href: '/admin/epicentr',          label: 'Огляд'  },
  { href: '/admin/epicentr/products', label: 'Товари' },
];

export default function EpicentrLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <MarketplaceTabs
        active="epicentr"
        activeBg="rgba(255,122,0,0.12)"
        activeText="#C2410C"
        tabs={TABS}
      />
      <div style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
