import MarketplaceTabs from '../components/MarketplaceTabs';

const TABS = [
  { href: '/admin/rozetka',             label: 'Огляд'   },
  { href: '/admin/rozetka/products',    label: 'Товари'  },
  { href: '/admin/rozetka/commissions', label: 'Комісії' },
  { href: '/admin/rozetka/audit',       label: 'Аудит'   },
  { href: '/admin/rozetka/moderation',  label: 'Модерація' },
];

export default function RozetkaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <MarketplaceTabs
        logo="rozetka"
        activeBg="rgba(0,160,70,0.1)"
        activeText="#15803D"
        tabs={TABS}
      />
      <div style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
