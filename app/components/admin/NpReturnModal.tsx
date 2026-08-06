'use client';

import { useEffect, useState } from 'react';

// Повернення посилки з Нової Пошти в один клік: коли клієнт не забирає посилку,
// менеджер відкриває це вікно з журналу і створює заявку на повернення в кабінеті
// НП. До створення показуємо живі дані НП — де лежить посилка, скільки днів
// зберігання вже накапало і куди саме вона поїде назад.

type RefDescription = { Ref: string; Description: string };

type Info = {
  ttn: string;
  possible: boolean;
  error: string | null;
  address: { Ref: string; City: string; Address: string; Counterparty: string; NonCash: boolean } | null;
  reason: RefDescription | null;
  subtypes: RefDescription[];
  defaultSubtypeRef: string | null;
  carrier: {
    status: string; statusCode: string; warehouse: string;
    storageDays: number; storagePrice: number; firstStorageDay: string;
  } | null;
  existing: { ref: string; number: string | null; ttn: string | null; createdAt: string | null } | null;
};

type Props = {
  orderId: string;
  orderNumber: number;
  onClose: () => void;
  onDone: () => void;
};

export default function NpReturnModal({ orderId, orderNumber, onClose, onDone }: Props) {
  const [info, setInfo]       = useState<Info | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [subtype, setSubtype] = useState('');
  const [note, setNote]       = useState('');
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const [done, setDone]       = useState<{ number: string | null; returnTo: string } | null>(null);

  // Відповідь може бути й не JSON — 500 від Next приходить HTML-сторінкою. Без
  // цієї обгортки res.json() кидав виняток усередині ефекту, стан лишався порожнім
  // і вікно назавжди зависало на «Запитуємо НП…».
  const readJson = async (res: Response): Promise<{ ok: boolean; data: Record<string, string> }> => {
    const text = await res.text();
    try {
      return { ok: res.ok, data: JSON.parse(text) };
    } catch {
      return { ok: false, data: { error: `Сервер повернув ${res.status} (не JSON) — подивіться логи` } };
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/orders/${orderId}/np-return`);
        const { ok, data } = await readJson(res);
        if (!alive) return;
        if (!ok) { setLoadErr(data.error ?? 'Не вдалося отримати дані НП'); return; }
        setInfo(data as unknown as Info);
        setSubtype((data as unknown as Info).defaultSubtypeRef ?? '');
      } catch {
        if (alive) setLoadErr('Не вдалося звʼязатися із сервером');
      }
    })();
    return () => { alive = false; };
  }, [orderId]);

  const create = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/np-return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtypeReasonRef: subtype || undefined, note: note.trim() || undefined }),
      });
      const { ok, data } = await readJson(res);
      setBusy(false);
      if (!ok) { setErr(data.error ?? 'Помилка створення заявки'); return; }
      setDone({ number: data.number ?? null, returnTo: data.returnTo });
      onDone();
    } catch {
      setBusy(false);
      setErr('Не вдалося звʼязатися із сервером');
    }
  };

  const cancel = async () => {
    if (!confirm('Скасувати заявку на повернення в НП?')) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/np-return`, { method: 'DELETE' });
      const { ok, data } = await readJson(res);
      setBusy(false);
      if (!ok) { setErr(data.error ?? 'Помилка скасування'); return; }
      onDone();
      onClose();
    } catch {
      setBusy(false);
      setErr('Не вдалося звʼязатися із сервером');
    }
  };

  const box: React.CSSProperties = {
    background: '#fff', borderRadius: '16px', padding: '24px', width: '470px', maxWidth: '96vw',
    maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  };
  const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '12.5px', padding: '3px 0' };
  const muted: React.CSSProperties = { color: '#6B7280' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}>
      <div className="adm-modal-box" style={box}>
        <div style={{ fontWeight: 800, fontSize: '16px', color: '#B45309' }}>↩ Повернення Новою Поштою</div>
        <div style={{ fontSize: '12.5px', color: '#6B7280', margin: '4px 0 16px', lineHeight: 1.5 }}>
          Замовлення #{orderNumber} — заявка створюється одразу в кабінеті НП. Посилка поїде назад
          на наше відділення, зберігання перестане капати.
        </div>

        {loadErr && (
          <div style={{ padding: '10px 12px', borderRadius: '9px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', fontSize: '12.5px' }}>
            {loadErr}
          </div>
        )}

        {!info && !loadErr && <div style={{ fontSize: '13px', color: '#6B7280' }}>Запитуємо НП…</div>}

        {info && done && (
          <div style={{ padding: '12px', borderRadius: '9px', background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#15803D', fontSize: '13px', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700 }}>✓ Заявка на повернення створена{done.number ? `: ${done.number}` : ''}</div>
            <div style={{ color: '#166534' }}>Посилка поїде на {done.returnTo}. Зворотну ЕН НП створить сама — вона зʼявиться в кабінеті.</div>
          </div>
        )}

        {info && !done && (
          <>
            <div style={{ padding: '10px 12px', borderRadius: '9px', background: 'var(--bg-soft, #F8FAFC)', border: '1px solid var(--border-light, #E2E8F0)', marginBottom: '14px' }}>
              <div style={row}><span style={muted}>ТТН</span><span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{info.ttn}</span></div>
              {info.carrier && <>
                <div style={row}><span style={muted}>Статус НП</span><span style={{ fontWeight: 600 }}>{info.carrier.status}</span></div>
                {info.carrier.warehouse && (
                  <div style={row}><span style={muted}>Відділення</span><span style={{ textAlign: 'right', maxWidth: '60%' }}>{info.carrier.warehouse}</span></div>
                )}
                {info.carrier.storageDays > 0 && (
                  <div style={row}>
                    <span style={muted}>Платне зберігання</span>
                    <span style={{ fontWeight: 700, color: '#B91C1C' }}>{info.carrier.storageDays} дн · {info.carrier.storagePrice} ₴</span>
                  </div>
                )}
              </>}
              {info.address && (
                <div style={row}>
                  <span style={muted}>Повернути на</span>
                  <span style={{ textAlign: 'right', maxWidth: '60%', fontWeight: 600 }}>{info.address.City}, {info.address.Address}</span>
                </div>
              )}
            </div>

            {info.existing ? (
              <div style={{ padding: '12px', borderRadius: '9px', background: '#FFF7ED', border: '1px solid #FDBA74', color: '#9A3412', fontSize: '13px', lineHeight: 1.6, marginBottom: '14px' }}>
                <div style={{ fontWeight: 700 }}>Заявка вже створена{info.existing.number ? `: ${info.existing.number}` : ''}</div>
                {info.existing.createdAt && (
                  <div style={{ fontSize: '12px' }}>від {new Date(info.existing.createdAt).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                )}
                <button onClick={cancel} disabled={busy}
                  style={{ marginTop: '8px', height: '32px', padding: '0 12px', borderRadius: '8px', border: '1px solid #FDBA74', background: '#fff', color: '#9A3412', fontSize: '12.5px', fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
                  Скасувати заявку в НП
                </button>
              </div>
            ) : !info.possible ? (
              <div style={{ padding: '10px 12px', borderRadius: '9px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', fontSize: '12.5px', lineHeight: 1.5, marginBottom: '14px' }}>
                {info.error ?? 'НП не дозволяє створити повернення по цій ТТН.'}
              </div>
            ) : (
              <>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '5px' }}>
                  Причина {info.reason ? `· ${info.reason.Description}` : ''}
                </label>
                <select value={subtype} onChange={e => setSubtype(e.target.value)}
                  style={{ width: '100%', height: '38px', padding: '0 10px', border: '1.5px solid var(--border, #E2E8F0)', borderRadius: '9px', fontSize: '13px', boxSizing: 'border-box', background: '#fff', marginBottom: '12px' }}>
                  {info.subtypes.map(s => <option key={s.Ref} value={s.Ref}>{s.Description}</option>)}
                </select>

                <label style={{ fontSize: '11px', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '5px' }}>
                  Коментар (необовʼязково) — лише українською, без латиниці, «#» і «:»
                </label>
                <input value={note} onChange={e => setNote(e.target.value)}
                  placeholder={`Повернення по замовленню ${orderNumber}`}
                  style={{ width: '100%', height: '38px', padding: '0 10px', border: '1.5px solid var(--border, #E2E8F0)', borderRadius: '9px', fontSize: '13px', boxSizing: 'border-box', marginBottom: '8px' }} />

                <div style={{ fontSize: '11.5px', color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '8px 10px', lineHeight: 1.5, marginBottom: '14px' }}>
                  Зворотна доставка платна — НП спише її з нашого рахунку ({info.address?.NonCash ? 'безготівково' : 'готівкою'}).
                  Товар потрібно буде оприбуткувати після отримання; фінансове повернення оформлюється окремо кнопкою «↩ Повернення».
                </div>
              </>
            )}
          </>
        )}

        {err && (
          <div style={{ padding: '9px 11px', borderRadius: '9px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', fontSize: '12.5px', marginBottom: '12px' }}>{err}</div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          <button onClick={onClose}
            style={{ flex: 1, height: '38px', borderRadius: '9px', border: '1px solid var(--border, #E2E8F0)', background: 'none', color: 'var(--text-secondary, #475569)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            {done ? 'Закрити' : 'Скасувати'}
          </button>
          {info && !done && !info.existing && info.possible && (
            <button onClick={create} disabled={busy}
              style={{ flex: 1, height: '38px', borderRadius: '9px', border: 'none', background: busy ? '#94A3B8' : '#B45309', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
              {busy ? '⏳ Створюємо…' : '↩ Створити повернення'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
