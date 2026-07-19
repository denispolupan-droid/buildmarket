'use client';

// Відправка рахунку клієнту в месенджер. Боти Telegram/Viber не можуть написати
// людині першими за номером телефону, тому робимо напівавтоматично: копіюємо
// готовий текст із посиланням на рахунок у буфер і відкриваємо чат із клієнтом
// за його номером у месенджері менеджера — залишається вставити (Ctrl+V) і надіслати.

import { useState } from 'react';
import { Send, Phone, Copy, Check } from 'lucide-react';

function normalizePhone(raw: string): string | null {
  const d = (raw || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('380')) return d;
  if (d.length === 10 && d.startsWith('0'))   return `38${d}`;
  if (d.length === 11 && d.startsWith('80'))  return `3${d}`;
  return null;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export default function InvoiceMessengerButtons({
  phone, contact, orderNumber, orderId, total, variant = 'admin',
  channel = null, promOrderId = null, rozetkaOrderId = null,
}: {
  phone: string;
  contact: string;
  orderNumber: number;
  orderId: string;
  total: number;
  variant?: 'admin' | 'toolbar';
  channel?: string | null;
  promOrderId?: string | number | null;
  rozetkaOrderId?: string | number | null;
}) {
  const [done, setDone] = useState<'tg' | 'viber' | 'copy' | null>(null);
  const normPhone = normalizePhone(phone);

  const mp = channel === 'rozetka' ? { name: 'Rozetka', num: String(rozetkaOrderId ?? orderNumber) }
           : channel === 'prom'    ? { name: 'Prom.ua', num: String(promOrderId ?? orderNumber) }
           : null;

  const message = [
    `Вітаємо, ${contact}! 🤝`,
    mp
      ? `Дякуємо за замовлення №${mp.num} на ${mp.name} — на суму ${Number(total).toFixed(2)} грн.`
      : `Дякуємо за замовлення №${orderNumber} у FIXLINE на суму ${Number(total).toFixed(2)} грн.`,
    `Рахунок на оплату: ${typeof window !== 'undefined' ? window.location.origin : 'https://fixline.com.ua'}/invoice/${orderId}`,
    `Після оплати повідомте нас, будь ласка, — замовлення, оплачені до 14:00, відправляємо того ж дня 🚚`,
  ].join('\n');

  function flash(kind: 'tg' | 'viber' | 'copy') {
    setDone(kind);
    setTimeout(() => setDone(null), 2500);
  }

  async function openTelegram() {
    await copyText(message);
    flash('tg');
    if (normPhone) window.open(`https://t.me/+${normPhone}`, '_blank', 'noopener');
  }

  async function openViber() {
    await copyText(message);
    flash('viber');
    if (normPhone) window.location.href = `viber://chat?number=%2B${normPhone}`;
  }

  async function copyOnly() {
    await copyText(message);
    flash('copy');
  }

  if (variant === 'toolbar') {
    const tb = {
      display: 'flex', alignItems: 'center', gap: '7px', height: '44px', padding: '0 16px',
      borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: 700,
      border: 'none', cursor: 'pointer',
    } as const;
    return (
      <>
        <button onClick={openTelegram} title={normPhone ? `Скопіювати текст і відкрити чат +${normPhone} у Telegram` : 'Номер телефону не розпізнано — текст буде скопійовано'}
          style={{ ...tb, background: '#2AABEE', boxShadow: '0 3px 12px rgba(42,171,238,0.3)' }}>
          <Send size={15} /> {done === 'tg' ? '✓ Скопійовано' : 'Telegram'}
        </button>
        <button onClick={openViber} title={normPhone ? `Скопіювати текст і відкрити чат +${normPhone} у Viber` : 'Номер телефону не розпізнано — текст буде скопійовано'}
          style={{ ...tb, background: '#7360F2', boxShadow: '0 3px 12px rgba(115,96,242,0.3)' }}>
          <Phone size={15} /> {done === 'viber' ? '✓ Скопійовано' : 'Viber'}
        </button>
      </>
    );
  }

  const small = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
    padding: '7px 0', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
    cursor: 'pointer', border: '1.5px solid #CBD5E1', background: 'var(--bg-card)',
    flex: 1, boxSizing: 'border-box',
  } as const;

  return (
    <div>
      <div style={{ display: 'flex', gap: '4px' }}>
        <button onClick={openTelegram} title={normPhone ? `Рахунок у Telegram: скопіювати текст і відкрити чат +${normPhone}` : 'Номер телефону не розпізнано — текст буде скопійовано'}
          style={{ ...small, color: '#2AABEE', borderColor: '#BEE3F8' }}>
          {done === 'tg' ? <Check size={14} color="#15803D" /> : <Send size={14} />}
        </button>
        <button onClick={openViber} title={normPhone ? `Рахунок у Viber: скопіювати текст і відкрити чат +${normPhone}` : 'Номер телефону не розпізнано — текст буде скопійовано'}
          style={{ ...small, color: '#7360F2', borderColor: '#DDD6FE' }}>
          {done === 'viber' ? <Check size={14} color="#15803D" /> : <Phone size={14} />}
        </button>
        <button onClick={copyOnly} title="Скопіювати текст із посиланням на рахунок"
          style={{ ...small, color: 'var(--text-secondary)' }}>
          {done === 'copy' ? <Check size={14} color="#15803D" /> : <Copy size={14} />}
        </button>
      </div>
      {done && (
        <div style={{ fontSize: '10.5px', color: '#15803D', fontWeight: 600, textAlign: 'center', marginTop: '3px' }}>
          Текст скопійовано — вставте в чат (Ctrl+V)
        </div>
      )}
    </div>
  );
}
