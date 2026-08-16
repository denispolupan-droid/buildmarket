import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../components/Footer';
import { Truck, Clock, MapPin, Package, CreditCard, Phone } from 'lucide-react';
import { NP_BRANCHES, RZ_POINTS, RZ_CITIES } from '../../lib/site';

export const metadata: Metadata = {
  title: 'Умови доставки',
  description: `Доставка будівельної хімії по всій Україні: Нова Пошта, ${RZ_POINTS} точок видачі ROZETKA, адресна доставка. Замовлення до 14:00 — відправка в той самий день.`,
  keywords: ['доставка будівельна хімія', 'Нова Пошта будматеріали', 'точки видачі ROZETKA', 'доставка строительная химия Украина', 'умови доставки'],
  alternates: { canonical: 'https://fixline.com.ua/delivery', languages: { 'uk': 'https://fixline.com.ua/delivery', 'ru': 'https://fixline.com.ua/ru/delivery', 'x-default': 'https://fixline.com.ua/delivery' } },
  openGraph: {
    title: 'Умови доставки — FIXLINE',
    description: 'Доставка по всій Україні. Нова Пошта, точки видачі ROZETKA, адресна доставка. Відправка в день замовлення.',
    url: 'https://fixline.com.ua/delivery',
    siteName: 'FIXLINE',
    locale: 'uk_UA',
    type: 'website',
    images: [{ url: 'https://fixline.com.ua/opengraph-image', width: 1200, height: 630, alt: 'FIXLINE — будівельна хімія' }],
  },
};

export default function DeliveryPage() {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Головна', item: 'https://fixline.com.ua' },
      { '@type': 'ListItem', position: 2, name: 'Умови доставки', item: 'https://fixline.com.ua/delivery' },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', padding: '48px 32px 80px' }}>

          <nav style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '24px', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <Link href="/" style={{ color: '#94A3B8', textDecoration: 'none' }}>Головна</Link>
            <span>/</span>
            <span>Умови доставки</span>
          </nav>

          <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>Умови доставки</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '48px' }}>Відправляємо по всій Україні щоденно, пн–пт</p>

          {/* Methods */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '48px' }} className="delivery-grid">

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Truck size={20} color="#4880B8" strokeWidth={2} />
                </div>
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Нова Пошта</h2>
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
                Доставка до відділення або поштомату Нової Пошти по всій Україні. Найшвидший і найзручніший спосіб для більшості замовлень.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {/* Кількість відділень — з lib/site (одна цифра на весь сайт):
                    тут стояло «понад 6000», а на головній 28 000, і сторінки
                    суперечили одна одній */}
                {['Доставка 1–2 дні', `Понад ${NP_BRANCHES.toLocaleString('uk-UA')} відділень і поштоматів по Україні`, 'Відстеження посилки в реальному часі', 'Накладений платіж або передоплата'].map(i => (
                  <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <span style={{ color: '#4880B8', flexShrink: 0, marginTop: '2px' }}>✓</span>{i}
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Package size={20} color="#15803D" strokeWidth={2} />
                </div>
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Точки видачі ROZETKA</h2>
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
                Забираєте замовлення у магазині або точці видачі ROZETKA — зручно, якщо ви й так буваєте поруч.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[`${RZ_POINTS} точок видачі у ${RZ_CITIES} містах України`, 'Накладений платіж або передоплата', 'Відстеження посилки на rozetka.delivery', 'З\'являється в кошику, якщо замовлення підходить точці за вагою'].map(i => (
                  <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <span style={{ color: '#15803D', flexShrink: 0, marginTop: '2px' }}>✓</span>{i}
                  </li>
                ))}
              </ul>
            </div>

            {/* Третій спосіб — на всю ширину під двома перевізниками. Не заради
                симетрії: адресна доставка іншого класу — не масовий перевізник,
                а домовленість для опту, і широка смуга під картками читається
                як примітка до них, а не як рівноцінний третій варіант. */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px', gridColumn: '1 / -1' }}>
              {/* Заголовок — окремим рядком НАД колонками, а не всередині лівої:
                  так опис і умови починаються з однієї висоти й вирівнюються по
                  верху, інакше ліва частина вища за праву рівно на заголовок. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MapPin size={20} color="#4880B8" strokeWidth={2} />
                </div>
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Адресна доставка</h2>
              </div>
              <div className="delivery-wide">
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0, flex: '1 1 300px', minWidth: 0 }}>
                  {/* Було «доставка власним транспортом» — власного транспорту
                      немає, тож формулювання не обіцяє способу доставки: він
                      залежить від обсягу партії й узгоджується окремо. */}
                  Для великих оптових замовлень доставку по Харкову та області узгоджуємо
                  окремо: спосіб, вартість і терміни залежать від обсягу партії.
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {['Доступно для оптових замовлень', 'Вартість і терміни — за домовленістю', 'Усі деталі узгоджує менеджер індивідуально'].map(i => (
                    <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                      <span style={{ color: '#4880B8', flexShrink: 0, marginTop: '2px' }}>✓</span>{i}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

          </div>

          {/* Terms */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '24px' }}>Терміни та умови</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {[
                { icon: Clock,      title: 'Обробка замовлення',  text: 'Замовлення, розміщені до 14:00 у робочі дні, відправляємо в той самий день. Замовлення після 14:00 — наступного робочого дня.' },
                { icon: Package,    title: 'Упаковка',            text: 'Товар упаковується в картонні коробки з наповнювачем. Для крихких і рідких матеріалів — посилена упаковка без додаткової оплати.' },
                { icon: CreditCard, title: 'Оплата при отриманні', text: 'Накладений платіж — оплачуєте при отриманні посилки у відділенні НП або в точці видачі ROZETKA. Для оптових клієнтів — передоплата на рахунок або через платіжну систему.' },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--border)' }}>
                    <Icon size={18} color="#4880B8" strokeWidth={2} />
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>{title}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Questions */}
          <div style={{ background: '#1E3A5F', borderRadius: '16px', padding: '28px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>Залишились питання щодо доставки?</div>
              <div style={{ fontSize: '13px', color: '#94A3B8' }}>Менеджер відповість протягом кількох хвилин</div>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <a href="tel:+380991997788" style={{ height: '40px', padding: '0 20px', borderRadius: '8px', background: '#4880B8', color: '#fff', fontSize: '13px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}>
                <Phone size={14} /> Зателефонувати
              </a>
              <Link href="/contacts" style={{ height: '40px', padding: '0 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', color: '#E2E8F0', fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', background: 'transparent' }}>
                Написати
              </Link>
            </div>
          </div>

        </div>
      </div>
      <Footer />
      <style>{`
        /* Умови по центру відносно лівої колонки: опис займає три рядки, список — менше,
           і при вирівнюванні по верху праворуч знизу лишалася мертва чверть картки */
        .delivery-wide { display: flex; gap: 28px; align-items: flex-start; }
        @media (max-width: 640px) {
          .delivery-grid { grid-template-columns: 1fr !important; }
          /* На вузькому екрані широка картка нічим не відрізняється від решти —
             два стовпці всередині перетворилися б на дві вузькі колонки тексту */
          /* У колонці центрування ставало б горизонтальним — списку це не треба */
          .delivery-wide { flex-direction: column; gap: 14px; align-items: stretch; }
          /* У колонковому flex flex-basis керує ВИСОТОЮ: 300px залишали
             всередині картки порожню діру на пів екрана */
          .delivery-wide > * { flex: 0 0 auto !important; }
        }
      `}</style>
    </>
  );
}
