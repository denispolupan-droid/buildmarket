import InventoryClient from './InventoryClient';

export const dynamic = 'force-dynamic';

// Гейт — у layout розділу (requireStaffPage)
export default async function InventoryPage() {
  return (
    <div style={{ maxWidth: '1000px' }}>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Перерахуйте фактичні залишки: нестача спишеться за FIFO-собівартістю, надлишок
        оприбуткується новою партією; різниця ляже на рахунок «Відхилення». Створюється
        документ «Інвентаризація» з відомістю розбіжностей.
      </p>
      <InventoryClient />
    </div>
  );
}
