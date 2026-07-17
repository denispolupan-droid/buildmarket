// Єдиний серверний блок «Доставка і оплата» на сторінці товару (SEO_SPEC, Фаза 5.6).
// Тільки реальні умови — джерело: app/delivery/page.tsx.

type Props = { lang?: 'uk' | 'ru' };

const CONTENT = {
  uk: {
    title: 'Доставка і оплата',
    rows: [
      {
        label: 'Доставка',
        text: 'Нова Пошта по всій Україні — Київ, Харків, Дніпро, Одеса, Львів та інші міста. Понад 6000 відділень, доставка 1–2 дні.',
      },
      {
        label: 'Відправка',
        text: 'Замовлення до 14:00 у робочі дні відправляємо в той самий день, після 14:00 — наступного робочого дня.',
      },
      {
        label: 'Оплата',
        text: 'Накладений платіж (оплата при отриманні) або передоплата на рахунок чи через платіжну систему.',
      },
      {
        label: 'Упаковка',
        text: 'Картонні коробки з наповнювачем; для рідких і крихких матеріалів — посилена упаковка без додаткової оплати.',
      },
    ],
  },
  ru: {
    title: 'Доставка и оплата',
    rows: [
      {
        label: 'Доставка',
        text: 'Новая Почта по всей Украине — Киев, Харьков, Днепр, Одесса, Львов и другие города. Более 6000 отделений, доставка 1–2 дня.',
      },
      {
        label: 'Отправка',
        text: 'Заказы до 14:00 в рабочие дни отправляем в тот же день, после 14:00 — на следующий рабочий день.',
      },
      {
        label: 'Оплата',
        text: 'Наложенный платёж (оплата при получении) или предоплата на счёт либо через платёжную систему.',
      },
      {
        label: 'Упаковка',
        text: 'Картонные коробки с наполнителем; для жидких и хрупких материалов — усиленная упаковка без доплаты.',
      },
    ],
  },
} as const;

export default function DeliveryInfo({ lang = 'uk' }: Props) {
  const t = CONTENT[lang];
  return (
    <section style={{ margin: '24px 0', padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
      <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
        {t.title}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {t.rows.map(({ label, text }) => (
          <p key={label} style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            <strong style={{ color: 'var(--text-primary)' }}>{label}:</strong> {text}
          </p>
        ))}
      </div>
    </section>
  );
}
