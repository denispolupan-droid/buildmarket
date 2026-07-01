import MarketplaceTabs from '../components/MarketplaceTabs';

const TABS = [
  { href: '/admin/prom',             label: 'Огляд'      },
  { href: '/admin/prom/products',    label: 'Товари'     },
  { href: '/admin/prom/prices',      label: 'Ціни'       },
  { href: '/admin/prom/commissions', label: 'Комісії'    },
  { href: '/admin/prom/orders',      label: 'Замовлення' },
];

export default function PromLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <MarketplaceTabs
        logo="prom"
        activeBg="rgba(124,58,237,0.1)"
        activeText="#6D28D9"
        tabs={TABS}
      />
      <div style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
