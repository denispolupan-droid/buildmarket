'use client';

/**
 * СТАТИЧНЕ ПРЕВʼЮ нового дизайну сторінки замовлення (окрема сторінка, без логіки).
 * Дані — зразкові (як на макеті). Мета: оцінити візуал перед перенесенням реальної логіки.
 * Маршрут: /admin/orders/preview
 */

import {
  Check, ChevronDown, Copy, Phone, Send, Printer, FileText, ShoppingCart,
  Truck, CreditCard, Star, Mail, MoreHorizontal, Package, Search, Bell,
} from 'lucide-react';

// ── Токени превʼю (світла тема, як на макеті) ────────────────────────────────
const INK = '#0F172A';
const SECONDARY = '#475569';
const MUTED = '#94A3B8';
const HAIR = '#E9EDF3';
const CARD = '#FFFFFF';
const CANVAS = '#EEF2F7';
const BLUE = '#2563EB';       // акцентна синя (як на макеті)
const BLUE_SOFT = '#EFF4FF';
const GREEN = '#16A34A';
const GREEN_SOFT = '#DCFCE7';
const AMBER = '#B45309';
const AMBER_SOFT = '#FEF3C7';
const RED = '#DC2626';

const card: React.CSSProperties = {
  background: CARD, border: `1px solid ${HAIR}`, borderRadius: '16px',
  boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)',
};
const secLabel: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em',
};
const fieldLabel: React.CSSProperties = {
  fontSize: '11px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.04em',
};
const selectStyle: React.CSSProperties = {
  width: '100%', height: '40px', padding: '0 12px', border: `1px solid ${HAIR}`,
  borderRadius: '10px', background: CARD, color: INK, fontSize: '13.5px', fontWeight: 500,
  appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
};

function Chip({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', height: '28px', padding: '0 11px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600, color, background: bg, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function ActionBtn({ icon, label, variant = 'default' }: { icon: React.ReactNode; label: string; variant?: 'default' | 'blue' | 'blueOutline' }) {
  const base: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '9px', width: '100%', height: '40px',
    padding: '0 12px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${HAIR}`, background: CARD, color: INK, textAlign: 'left',
  };
  const v = variant === 'blue'
    ? { ...base, border: `1px solid ${BLUE}`, background: BLUE, color: '#fff' }
    : variant === 'blueOutline'
      ? { ...base, border: `1px solid #BFD3FF`, background: BLUE_SOFT, color: BLUE }
      : base;
  return <button style={v}>{icon}<span>{label}</span></button>;
}

export default function OrderPreviewPage() {
  return (
    <div style={{ flex: 1, height: '100vh', overflow: 'auto', background: CANVAS }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 28px', borderBottom: `1px solid ${HAIR}`, background: CARD, position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px' }}>
          <span style={{ color: MUTED }}>Замовлення</span>
          <ChevronDown size={13} style={{ transform: 'rotate(-90deg)', color: MUTED }} />
          <span style={{ color: INK, fontWeight: 600 }}>#26071017</span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '38px', padding: '0 12px', width: '260px', border: `1px solid ${HAIR}`, borderRadius: '10px', color: MUTED, fontSize: '13px' }}>
          <Search size={15} /> Пошук… <span style={{ marginLeft: 'auto', fontSize: '11px' }}>Ctrl + K</span>
        </div>
        <button style={{ position: 'relative', width: '38px', height: '38px', borderRadius: '10px', border: `1px solid ${HAIR}`, background: CARD, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: SECONDARY }}>
          <Bell size={16} />
          <span style={{ position: 'absolute', top: '-4px', right: '-4px', minWidth: '16px', height: '16px', borderRadius: '999px', background: BLUE, color: '#fff', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>2</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '999px', background: '#1E3A5F', color: '#fff', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>AD</div>
          <ChevronDown size={14} color={MUTED} />
        </div>
      </div>

      {/* Body: main + right panel */}
      <div style={{ display: 'flex', gap: '20px', padding: '24px 28px', alignItems: 'flex-start' }}>

        {/* ── MAIN ─────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, letterSpacing: '-0.02em', color: INK }}>Замовлення #26071017</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                <Chip color={GREEN} bg={GREEN_SOFT}><span style={{ width: '7px', height: '7px', borderRadius: '999px', background: GREEN }} />Нове</Chip>
                <Chip color={GREEN} bg={GREEN_SOFT}><Check size={13} />Оплачено</Chip>
                <Chip color={BLUE} bg={BLUE_SOFT}><Mail size={13} />Rozetka</Chip>
                <Chip color={SECONDARY} bg="#F1F5F9">20 липня 2024, 22:17</Chip>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.02em', color: INK, fontVariantNumeric: 'tabular-nums' }}>1713 ₴</div>
              <div style={{ fontSize: '12px', color: MUTED }}>Сума замовлення</div>
            </div>
            <button style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '44px', padding: '0 20px', borderRadius: '12px', border: 'none', background: BLUE, color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(37,99,235,0.4)' }}>
              <Check size={17} /> Підтвердити замовлення
            </button>
            <button style={{ width: '44px', height: '44px', borderRadius: '12px', border: `1px solid ${HAIR}`, background: CARD, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: SECONDARY }}>
              <MoreHorizontal size={18} />
            </button>
          </div>

          {/* Клієнт + Доставка */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Клієнт */}
            <div style={{ ...card, padding: '20px' }}>
              <div style={secLabel}>Клієнт</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '14px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '999px', background: '#EEF2FF', color: BLUE, fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>БВ</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: INK }}>Багдасарян Вилен Каренович</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: 700, color: BLUE, background: BLUE_SOFT, border: '1px solid #D6E3F0', borderRadius: '6px', padding: '1px 7px' }}>Картка ↗</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '4px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13.5px', color: BLUE, fontWeight: 600 }}><Phone size={13} />380976433443</span>
                    <Copy size={13} color={MUTED} />
                  </div>
                </div>
              </div>
              <div style={{ marginTop: '12px' }}>
                <Chip color={AMBER} bg={AMBER_SOFT}><Phone size={12} />Потрібен дзвінок</Chip>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '16px', paddingTop: '14px', borderTop: `1px solid ${HAIR}`, fontSize: '12.5px', color: SECONDARY }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Star size={13} color="#F59E0B" fill="#F59E0B" /> 5.0</span>
                <span style={{ color: HAIR }}>|</span>
                <span>12 замовлень</span>
                <span style={{ color: HAIR }}>|</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><ShoppingCart size={13} /> Rozetka</span>
              </div>
            </div>

            {/* Доставка */}
            <div style={{ ...card, padding: '20px' }}>
              <div style={secLabel}>Доставка</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginTop: '14px', fontSize: '16px', fontWeight: 700, color: INK }}>
                <Truck size={18} color={BLUE} /> Нова Пошта
              </div>
              <div style={{ marginTop: '10px', fontSize: '13.5px', color: SECONDARY, lineHeight: 1.5 }}>
                Відділення №26, м. Запоріжжя<br />
                вул. Північнокільцева, 3
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
                <Chip color={GREEN} bg={GREEN_SOFT}><Check size={13} />Оплачено 125,00 ₴</Chip>
                <FileText size={14} color={MUTED} />
              </div>
            </div>
          </div>

          {/* Товари */}
          <div style={{ ...card, padding: '20px' }}>
            <div style={{ ...secLabel, marginBottom: '4px' }}>Товари <span style={{ color: MUTED }}>(1)</span></div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${HAIR}` }}>
                  <th style={{ textAlign: 'left', padding: '0 0 10px', ...fieldLabel }}>Товар</th>
                  <th style={{ textAlign: 'left', padding: '0 0 10px', ...fieldLabel }}>Артикул / SKU</th>
                  <th style={{ textAlign: 'right', padding: '0 0 10px', ...fieldLabel }}>Кількість</th>
                  <th style={{ textAlign: 'right', padding: '0 0 10px', ...fieldLabel }}>Ціна</th>
                  <th style={{ textAlign: 'right', padding: '0 0 10px', ...fieldLabel }}>Сума</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '14px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: MUTED }}><Package size={18} /></div>
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: INK, lineHeight: 1.35 }}>Клей Pattex Shoe Glue<br />для взуття 50 г</div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 0' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px', color: MUTED }}>1600-006 <Copy size={12} /></span>
                  </td>
                  <td style={{ padding: '14px 0', textAlign: 'right', fontSize: '13.5px', fontWeight: 600, color: INK, fontVariantNumeric: 'tabular-nums' }}>1 шт</td>
                  <td style={{ padding: '14px 0', textAlign: 'right', fontSize: '13.5px', fontWeight: 600, color: INK, fontVariantNumeric: 'tabular-nums' }}>125 ₴</td>
                  <td style={{ padding: '14px 0', textAlign: 'right', fontSize: '13.5px', fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>125 ₴</td>
                </tr>
                <tr style={{ borderTop: `1px solid ${HAIR}` }}>
                  <td colSpan={4} style={{ padding: '12px 0 0', textAlign: 'right', fontSize: '13px', fontWeight: 600, color: SECONDARY }}>Разом</td>
                  <td style={{ padding: '12px 0 0', textAlign: 'right', fontSize: '15px', fontWeight: 800, color: INK, fontVariantNumeric: 'tabular-nums' }}>125 ₴</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Фінанси + Логістика + ТТН */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
            {/* Фінанси */}
            <div style={{ ...card, padding: '20px' }}>
              <div style={secLabel}>Фінанси</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px', fontSize: '13.5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: SECONDARY }}>Сума замовлення</span><span style={{ fontWeight: 600, color: INK, fontVariantNumeric: 'tabular-nums' }}>125,00 ₴</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: SECONDARY }}>Комісія Rozetka</span><span style={{ fontWeight: 600, color: RED, fontVariantNumeric: 'tabular-nums' }}>−10,50 ₴</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: SECONDARY }}>Доставка</span><span style={{ fontWeight: 600, color: INK, fontVariantNumeric: 'tabular-nums' }}>0,00 ₴</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: `1px solid ${HAIR}` }}><span style={{ fontWeight: 700, color: INK }}>Чистий дохід</span><span style={{ fontWeight: 800, color: GREEN, fontVariantNumeric: 'tabular-nums' }}>114,50 ₴</span></div>
              </div>
            </div>

            {/* Логістика */}
            <div style={{ ...card, padding: '20px' }}>
              <div style={secLabel}>Логістика</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px', fontSize: '13.5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: SECONDARY }}>Тип цін</span><span style={{ fontWeight: 600, color: INK }}>Роздріб</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: SECONDARY }}>Відвантажує постачальник</span><span style={{ fontWeight: 600, color: INK }}>Так</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: SECONDARY }}>Спосіб виконання</span><span style={{ fontWeight: 600, color: INK }}>Постачальник</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: SECONDARY }}>Наш склад <span style={{ width: '13px', height: '13px', borderRadius: '999px', border: `1px solid ${MUTED}`, color: MUTED, fontSize: '9px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>i</span></span><span style={{ fontWeight: 600, color: MUTED }}>Недоступний</span></div>
              </div>
            </div>

            {/* ТТН */}
            <div style={{ ...card, padding: '20px' }}>
              <div style={secLabel}>ТТН Нової Пошти</div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                <input defaultValue="59000000000000" style={{ flex: 1, minWidth: 0, height: '40px', padding: '0 12px', border: `1px solid ${HAIR}`, borderRadius: '10px', fontSize: '13px', color: INK, fontVariantNumeric: 'tabular-nums' }} />
                <button style={{ width: '40px', height: '40px', borderRadius: '10px', border: `1px solid ${HAIR}`, background: CARD, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: SECONDARY }}><Copy size={15} /></button>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button style={{ flex: 1, height: '40px', borderRadius: '10px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Зберегти</button>
                <button style={{ width: '40px', height: '40px', borderRadius: '10px', border: `1px solid ${HAIR}`, background: CARD, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: SECONDARY }}><Truck size={16} /></button>
              </div>
              <button style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', height: '40px', marginTop: '10px', borderRadius: '10px', border: '1px solid #BFD3FF', background: BLUE_SOFT, color: BLUE, fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}><Mail size={15} /> Надіслати постачальнику</button>
            </div>
          </div>

          {/* Історія замовлення */}
          <div style={{ ...card, padding: '20px 24px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={secLabel}>Історія замовлення</div>
              <button style={{ height: '32px', padding: '0 12px', borderRadius: '8px', border: `1px solid ${HAIR}`, background: CARD, color: SECONDARY, fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}>Показати всі події</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', marginTop: '28px' }}>
              {[
                { st: 'done',    dot: BLUE,   icon: <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: '#fff' }} />, title: 'Нове', date: '20.07.24, 22:17', sub: 'Створено замовлення' },
                { st: 'done',    dot: GREEN,  icon: <Check size={13} color="#fff" />, title: 'Оплачено', date: '20.07.24, 22:20', sub: 'Клієнт оплатив замовлення' },
                { st: 'active',  dot: BLUE,   icon: <Phone size={12} color="#fff" />, title: 'Потрібен дзвінок', date: '20.07.24, 22:22', sub: 'Позначено менеджером' },
                { st: 'idle',    dot: '#CBD5E1', icon: null, title: 'Підтверджено', date: '', sub: 'Очікує підтвердження' },
                { st: 'idle',    dot: '#CBD5E1', icon: null, title: 'Відправлено постачальнику', date: '', sub: 'Очікує відправки' },
                { st: 'idle',    dot: '#CBD5E1', icon: null, title: 'Виконано', date: '', sub: 'Замовлення виконано' },
              ].map((s, i, arr) => (
                <div key={i} style={{ position: 'relative', textAlign: 'center', paddingTop: '4px' }}>
                  {/* connector */}
                  {i < arr.length - 1 && (
                    <div style={{ position: 'absolute', top: '13px', left: '50%', width: '100%', height: '2px', background: arr[i + 1].st === 'idle' ? '#E2E8F0' : (s.dot as string) }} />
                  )}
                  <div style={{ position: 'relative', zIndex: 1, width: '28px', height: '28px', margin: '0 auto', borderRadius: '999px', background: s.st === 'idle' ? '#F1F5F9' : (s.dot as string), border: s.st === 'idle' ? `2px solid #CBD5E1` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {s.icon}
                  </div>
                  <div style={{ marginTop: '10px', fontSize: '12.5px', fontWeight: 700, color: s.st === 'idle' ? MUTED : INK, padding: '0 6px', lineHeight: 1.3 }}>{s.title}</div>
                  {s.date && <div style={{ marginTop: '3px', fontSize: '11px', color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{s.date}</div>}
                  <div style={{ marginTop: '3px', fontSize: '11px', color: MUTED, padding: '0 6px', lineHeight: 1.3 }}>{s.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ─────────────────────────────────────── */}
        <div style={{ width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '20px', position: 'sticky', top: '92px' }}>
          {/* Управління */}
          <div style={{ ...card, padding: '20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: INK, marginBottom: '16px' }}>Управління замовленням</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div><div style={{ ...fieldLabel, marginBottom: '6px' }}>Статус</div><select style={selectStyle} defaultValue="Нове"><option>Нове</option><option>Підтверджено</option></select></div>
              <div><div style={{ ...fieldLabel, marginBottom: '6px' }}>Тип ціни</div><select style={selectStyle} defaultValue="Роздріб"><option>Роздріб</option><option>Опт</option></select></div>
              <div><div style={{ ...fieldLabel, marginBottom: '6px' }}>Спосіб виконання</div><select style={selectStyle} defaultValue="Постачальник"><option>Постачальник</option><option>Наш склад</option></select></div>
              <div><div style={{ ...fieldLabel, marginBottom: '6px' }}>Наш склад</div><select style={selectStyle} defaultValue="Недоступний"><option>Недоступний</option></select></div>
            </div>
          </div>

          {/* Дії */}
          <div style={{ ...card, padding: '20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: INK, marginBottom: '14px' }}>Дії</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <ActionBtn icon={<Phone size={15} color={SECONDARY} />} label="Подзвонити клієнту" />
              <ActionBtn icon={<Send size={15} color={SECONDARY} />} label="Написати в Telegram" />
              <ActionBtn icon={<Printer size={15} color={SECONDARY} />} label="Друк / Рахунок" />
              <ActionBtn icon={<FileText size={15} color={SECONDARY} />} label="Печать замовлення" />
              <ActionBtn icon={<ShoppingCart size={15} color={SECONDARY} />} label="Створити ЗП" />
              <ActionBtn icon={<Mail size={15} />} label="Відправити постачальнику" variant="blueOutline" />
              <ActionBtn icon={<FileText size={15} />} label="Створити ТТН" variant="blueOutline" />
            </div>
          </div>

          {/* Нотатки */}
          <div style={{ ...card, padding: '20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: INK, marginBottom: '12px' }}>Внутрішні нотатки</div>
            <textarea placeholder="Додати нотатку…" style={{ width: '100%', minHeight: '90px', padding: '10px 12px', border: `1px solid ${HAIR}`, borderRadius: '10px', fontSize: '13px', color: INK, resize: 'vertical', fontFamily: 'inherit' }} />
            <button style={{ width: '100%', height: '40px', marginTop: '10px', borderRadius: '10px', border: 'none', background: '#F1F5F9', color: MUTED, fontSize: '13px', fontWeight: 600, cursor: 'not-allowed' }}>Зберегти нотатку</button>
          </div>
        </div>
      </div>
    </div>
  );
}
