'use client';

import { useState } from 'react';
import { Wallet, CheckCircle, XCircle, Plus, ChevronDown, ChevronUp, Users } from 'lucide-react';

type Partner = {
  id: string; name: string; email: string; phone: string | null;
  balance: number; balance_held: number; is_active: boolean;
  created_at: string; partner_code: string | null;
  orders_total: number; orders_delivered: number;
};

type Payout = {
  id: string; customer_id: string; amount: number; method: string;
  status: string; bank_details: string | null; requested_at: string; notes: string | null;
};

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid var(--border)',
  borderRadius: '8px', fontSize: '13px', background: 'var(--bg-soft)',
  color: 'var(--text-primary)', boxSizing: 'border-box',
};

export default function PartnersClient({
  partners, pendingPayouts,
}: {
  partners: Partner[];
  pendingPayouts: Payout[];
}) {
  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [topupId,     setTopupId]     = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupNote,   setTopupNote]   = useState('');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [payouts,     setPayouts]     = useState<Payout[]>(pendingPayouts);
  const [partnersData, setPartnersData] = useState<Partner[]>(partners);

  const totalBalance = partnersData.reduce((s, p) => s + Number(p.balance), 0);
  const activeCount  = partnersData.filter(p => p.is_active).length;

  async function handleTopup(partnerId: string) {
    if (!topupAmount || Number(topupAmount) <= 0) { setError('Вкажіть суму'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/admin/partners/topup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: partnerId, amount: Number(topupAmount), description: topupNote || 'Поповнення балансу (адмін)' }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? 'Помилка'); return; }
    setPartnersData(prev => prev.map(p =>
      p.id === partnerId ? { ...p, balance: Number(p.balance) + Number(topupAmount) } : p
    ));
    setTopupId(null); setTopupAmount(''); setTopupNote('');
  }

  async function handlePayout(payoutId: string, action: 'approve' | 'reject') {
    setSaving(true);
    const res = await fetch(`/api/admin/partners/payout/${payoutId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setSaving(false);
    if (res.ok) setPayouts(prev => prev.filter(p => p.id !== payoutId));
  }

  async function toggleActive(partnerId: string, current: boolean) {
    await fetch(`/api/admin/partners/${partnerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !current }),
    });
    setPartnersData(prev => prev.map(p => p.id === partnerId ? { ...p, is_active: !current } : p));
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Клієнти</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Дропшип-партнери та оптові клієнти — баланси і розрахунки
          </p>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Партнерів', value: String(partnersData.length), sub: `${activeCount} активних`, color: '#1E3A5F', icon: Users },
          { label: 'Загальний баланс', value: `${totalBalance.toFixed(0)} ₴`, sub: 'Сума всіх балансів', color: '#15803D', icon: Wallet },
          { label: 'Заявок на виплату', value: String(payouts.length), sub: 'Очікують підтвердження', color: payouts.length ? '#B45309' : '#64748B', icon: CheckCircle },
        ].map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{c.label}</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{c.sub}</div>
              </div>
              <div style={{ width: '38px', height: '38px', borderRadius: '9px', background: 'var(--bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={17} color={c.color} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Pending payouts */}
      {payouts.length > 0 && (
        <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#B45309', marginBottom: '12px' }}>
            ⏳ Заявки на виплату ({payouts.length})
          </h2>
          {payouts.map(payout => {
            const partner = partnersData.find(p => p.id === payout.customer_id);
            return (
              <div key={payout.id} style={{ background: '#fff', border: '1px solid #FDE68A', borderRadius: '8px', padding: '14px 16px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                    {partner?.name ?? payout.customer_id} — {payout.amount.toFixed(2)} ₴
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                    {payout.method === 'bank' ? `Переказ: ${payout.bank_details ?? '—'}` : 'Товарний залік'}
                    {' · '}{new Date(payout.requested_at).toLocaleDateString('uk-UA')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => handlePayout(payout.id, 'approve')} disabled={saving} style={{ height: '32px', padding: '0 14px', borderRadius: '7px', border: 'none', background: '#15803D', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <CheckCircle size={13} /> Підтвердити
                  </button>
                  <button onClick={() => handlePayout(payout.id, 'reject')} disabled={saving} style={{ height: '32px', padding: '0 14px', borderRadius: '7px', border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <XCircle size={13} /> Відхилити
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Partners list */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 80px 80px 160px', padding: '10px 20px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', gap: '12px' }}>
          <span>Партнер</span><span style={{ textAlign: 'right' }}>Баланс</span><span style={{ textAlign: 'right' }}>Замовлень</span><span style={{ textAlign: 'center' }}>Доставлено</span><span style={{ textAlign: 'center' }}>Статус</span><span style={{ textAlign: 'right' }}>Дії</span>
        </div>

        {partnersData.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            Партнерів ще немає
          </div>
        ) : (
          partnersData.map((partner, i) => {
            const isExpanded = expandedId === partner.id;
            const isTopup    = topupId === partner.id;
            const avail = Number(partner.balance) - Number(partner.balance_held);

            return (
              <div key={partner.id} style={{ borderBottom: i < partnersData.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 80px 80px 160px', padding: '14px 20px', alignItems: 'center', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{partner.name}</span>
                      <span style={{
                        fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px',
                        background: (partner as { type?: string }).type === 'dropship_partner' ? '#EFF6FF' : '#F0FDF4',
                        color:      (partner as { type?: string }).type === 'dropship_partner' ? '#4880B8' : '#15803D',
                      }}>
                        {(partner as { type?: string }).type === 'dropship_partner' ? 'Дроп' : 'Опт'}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{partner.email}</div>
                    {partner.phone && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{partner.phone}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: avail >= 0 ? '#15803D' : '#DC2626' }}>{avail.toFixed(0)} ₴</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>всього: {Number(partner.balance).toFixed(0)} ₴</div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{partner.orders_total}</div>
                  <div style={{ textAlign: 'center', fontSize: '13px', color: '#15803D' }}>{partner.orders_delivered}</div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button onClick={() => toggleActive(partner.id, partner.is_active)} style={{ padding: '3px 10px', borderRadius: '20px', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', background: partner.is_active ? '#DCFCE7' : '#F1F5F9', color: partner.is_active ? '#16A34A' : '#64748B' }}>
                      {partner.is_active ? 'Активний' : 'Вимкнено'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <button onClick={() => { setTopupId(isTopup ? null : partner.id); setTopupAmount(''); setTopupNote(''); setError(''); }} style={{ height: '30px', padding: '0 10px', borderRadius: '7px', border: 'none', background: '#EFF6FF', color: '#4880B8', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Plus size={12} /> Поповнити
                    </button>
                    <button onClick={() => setExpandedId(isExpanded ? null : partner.id)} style={{ height: '30px', width: '30px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  </div>
                </div>

                {/* Topup form */}
                {isTopup && (
                  <div style={{ padding: '0 20px 14px', display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                    {error && <div style={{ color: '#DC2626', fontSize: '12px', marginBottom: '4px' }}>{error}</div>}
                    <div style={{ width: '120px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Сума ₴</div>
                      <input type="number" min={1} step={50} value={topupAmount} onChange={e => setTopupAmount(e.target.value)} placeholder="500" style={inp} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Примітка</div>
                      <input value={topupNote} onChange={e => setTopupNote(e.target.value)} placeholder="Оплата рахунку №..." style={inp} />
                    </div>
                    <button onClick={() => handleTopup(partner.id)} disabled={saving} style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: 'none', background: '#15803D', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1, flexShrink: 0 }}>
                      {saving ? '...' : 'Поповнити'}
                    </button>
                    <button onClick={() => setTopupId(null)} style={{ height: '36px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer', flexShrink: 0 }}>Скасувати</button>
                  </div>
                )}

                {/* Expanded: transaction history */}
                {isExpanded && <PartnerTransactions partnerId={partner.id} />}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

function PartnerTransactions({ partnerId }: { partnerId: string }) {
  const [txs,     setTxs]     = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(false);

  if (!txs && !loading) {
    setLoading(true);
    fetch(`/api/admin/partners/${partnerId}/transactions`)
      .then(r => r.json())
      .then(data => { setTxs(data); setLoading(false); })
      .catch(() => { setTxs([]); setLoading(false); });
  }

  const TX_LABELS: Record<string, string> = {
    top_up: 'Поповнення', charge: 'Списання', cod_credit: 'COD нарахування',
    np_fee: 'Комісія НП', return_refund: 'Повернення товару', return_fee: 'Зворотна доставка',
    payout: 'Виплата', goods_offset: 'Товарний залік', adjustment: 'Коригування',
  };

  return (
    <div style={{ background: 'var(--bg-soft)', borderTop: '1px solid var(--border)', padding: '12px 20px' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
        Останні транзакції
      </div>
      {loading && <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Завантаження...</div>}
      {txs?.length === 0 && <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Транзакцій немає</div>}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {txs?.map((tx: any) => (
        <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-light)', fontSize: '12px' }}>
          <div>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{TX_LABELS[tx.tx_type] ?? tx.tx_type}</span>
            {tx.description && <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>{tx.description}</span>}
          </div>
          <div style={{ display: 'flex', gap: '16px', flexShrink: 0 }}>
            <span style={{ color: tx.amount >= 0 ? '#15803D' : '#DC2626', fontWeight: 700 }}>
              {tx.amount >= 0 ? '+' : ''}{Number(tx.amount).toFixed(2)} ₴
            </span>
            <span style={{ color: 'var(--text-muted)', minWidth: '80px', textAlign: 'right' }}>
              {new Date(tx.created_at).toLocaleDateString('uk-UA')}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
