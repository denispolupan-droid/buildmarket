'use client';

import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { extractTaxCode } from '../../../lib/company-code';
import { showToast } from '../../../lib/toast';
import type { Order } from './types';

/**
 * Код ЄДРПОУ/ІПН у коментарі чи полі «Компанія», а рахунок ще на фізособу —
 * пропонуємо одним кліком перевести на підприємство (13.11.2026, №26111088).
 * Назву перевіряє сервер за кодом (Нова Пошта); реквізити йдуть і в картку
 * контрагента (lib/customer-company).
 */
export function CompanyHint({ order, onApplied }: {
  order: Order;
  onApplied: (patch: Partial<Order>) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (order.invoice_as_company) return null;
  const hit = extractTaxCode(`${order.company ?? ''}\n${order.comment ?? ''}`);
  if (!hit) return null;
  const label = hit.code.length === 10 ? 'ІПН' : 'ЄДРПОУ';

  async function apply() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/company`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: hit!.code, name: hit!.nameHint ?? undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(d.error ?? 'Не вдалося заповнити реквізити', 'error', 8000); return; }
      onApplied({ company: d.name, invoice_as_company: true });
      showToast(d.verified
        ? `Рахунок на ${d.name} (${label} ${d.code})${d.linked ? ' — замовлення перенесено на наявну картку' : ''}`
        : `Нова Пошта код не знайшла — записано назву з коментаря: ${d.name}`, d.verified ? 'success' : 'error', 8000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '8px 10px', borderRadius: '8px',
      background: 'var(--blue-bg)', border: '1px solid var(--border-light)', fontSize: '12.5px', color: 'var(--text-primary)' }}>
      <Building2 size={14} color="var(--brand-blue)" aria-hidden />
      <span style={{ flex: 1, minWidth: '180px' }}>
        У коментарі {label} <b style={{ fontVariantNumeric: 'tabular-nums' }}>{hit.code}</b>
        {hit.nameHint ? <> · {hit.nameHint}</> : null}. Виставити рахунок на підприємство?
      </span>
      <button type="button" onClick={apply} disabled={busy}
        style={{ height: '28px', padding: '0 12px', borderRadius: '7px', border: 'none', cursor: busy ? 'wait' : 'pointer',
          background: 'var(--navy)', color: 'var(--surface)', fontSize: '12.5px', fontWeight: 600, whiteSpace: 'nowrap' }}>
        {busy ? 'Перевіряю…' : 'Заповнити реквізити'}
      </button>
    </div>
  );
}
