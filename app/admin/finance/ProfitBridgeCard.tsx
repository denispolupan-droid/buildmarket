import type React from 'react';
import type { ProfitBridge, BridgeLine } from '../../../lib/accounting/profit-bridge-rules';
import { fmtInt } from '../../../lib/format';

/**
 * «Від замовлень до обліку» — той самий блок на «Огляді» й «Аналітиці»
 * (lib/accounting/profit-bridge): виручка й валовий прибуток по замовленнях
 * періоду розкладені по рядках до факту обліку. Рядок «нерозкладено» з'являється
 * лише якщо сума рядків не зійшлась — це баг, а не нюанс.
 */
export type BridgeWithNet = ProfitBridge & { opex: number; taxes: number; net: number };

export default function ProfitBridgeCard({ bridge, periodLabel }: { bridge: BridgeWithNet; periodLabel: string }) {
  const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtInt(Math.abs(n))} ₴`;
  // Чистий факт — продовження валового: ті самі проводки, мінус операційні витрати й податки
  const netRows = (
    <>
      <tr>
        <td className="muted" style={{ fontWeight: 500 }} title="Оренда, зарплата, реклама, пакування, логістика закупівель, списання боргів. Компенсації (напр. НП за пошкоджену посилку) зменшують витрати — тому сума буває зі знаком «+».">
          операційні витрати і компенсації ⓘ
        </td>
        <td className="num" style={{ color: bridge.opex > 0 ? '#C2410C' : 'var(--color-success)' }}>{signed(-bridge.opex)}</td>
      </tr>
      <tr>
        <td className="muted" style={{ fontWeight: 500 }}>податки</td>
        <td className="num" style={{ color: '#C2410C' }}>{signed(-bridge.taxes)}</td>
      </tr>
      <tr>
        <td style={{ fontWeight: 700, borderBottom: 'none' }}>Чистий прибуток · факт обліку</td>
        <td className="num" style={{ fontWeight: 800, borderBottom: 'none', color: bridge.net >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{fmtInt(bridge.net)} ₴</td>
      </tr>
    </>
  );
  const block = (title: string, startLabel: string, b: ProfitBridge['revenue'], factLabel: string, tail?: React.ReactNode) => (
    <div style={{ minWidth: 0 }}>
      <div className="fin-card-title" style={{ fontSize: '13px' }}>{title}</div>
      <table className="fin-table">
        <tbody>
          <tr>
            <td style={{ fontWeight: 600 }}>{startLabel}</td>
            <td className="num" style={{ fontWeight: 700 }}>{fmtInt(b.start)} ₴</td>
          </tr>
          {b.lines.map((l: BridgeLine) => (
            <tr key={l.key} title={l.hint}>
              <td className="muted" style={{ fontWeight: 500 }}>{l.label}{l.hint ? ' ⓘ' : ''}</td>
              <td className="num" style={{ color: l.amount < 0 ? '#C2410C' : 'var(--color-success)' }}>{signed(l.amount)}</td>
            </tr>
          ))}
          {Math.abs(b.unexplained) >= 0.5 && (
            <tr>
              <td style={{ color: 'var(--color-danger)', fontWeight: 600 }}>нерозкладено (помилка звірки)</td>
              <td className="num" style={{ color: 'var(--color-danger)' }}>{signed(b.unexplained)}</td>
            </tr>
          )}
          <tr>
            <td style={{ fontWeight: 700, borderBottom: tail ? undefined : 'none' }}>{factLabel}</td>
            <td className="num" style={{ fontWeight: 800, borderBottom: tail ? undefined : 'none' }}>{fmtInt(b.fact)} ₴</td>
          </tr>
          {tail}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="fin-card" style={{ marginBottom: '16px' }}>
      <div className="fin-card-title">
        Від замовлень до обліку · {periodLabel}
        <span className="fin-card-sub"> · чому сума замовлень і прибуток по них не дорівнюють факту з бухгалтерських проводок — по рядках, до гривні</span>
      </div>
      <div className="fin-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '6px' }}>
        {block('Виручка', 'Замовлення · сума (створені за період)', bridge.revenue, 'Виручка · факт обліку')}
        {block('Прибуток', 'Прибуток вручених замовлень періоду', bridge.profit, 'Валовий прибуток · факт обліку', netRows)}
      </div>
    </div>
  );
}
