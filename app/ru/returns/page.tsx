import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../../components/Footer';
import { RefreshCw, CheckCircle, XCircle, Phone, Clock } from 'lucide-react';

const BASE = 'https://fixline.com.ua';

export const metadata: Metadata = {
  title: 'Политика возврата',
  description: 'Условия возврата и обмена товаров FIXLINE. Как вернуть товар, сроки и порядок действий.',
  keywords: ['возврат товара', 'обмен товара', 'политика возврата строительная химия'],
  alternates: {
    canonical: `${BASE}/ru/returns`,
    languages: { 'uk': `${BASE}/returns`, 'ru': `${BASE}/ru/returns`, 'x-default': `${BASE}/returns` },
  },
  openGraph: {
    title: 'Политика возврата — FIXLINE',
    description: 'Условия возврата и обмена товаров. 14 дней на возврат товара надлежащего качества.',
    url: `${BASE}/ru/returns`,
    siteName: 'FIXLINE',
    locale: 'ru_RU',
  },
};

export default function ReturnsRuPage() {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${BASE}/ru` },
      { '@type': 'ListItem', position: 2, name: 'Политика возврата', item: `${BASE}/ru/returns` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '48px 32px 80px' }}>

          <nav style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '24px', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <Link href="/ru" style={{ color: '#94A3B8', textDecoration: 'none' }}>Главная</Link>
            <span>/</span>
            <span>Политика возврата</span>
          </nav>

          <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>Политика возврата</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '48px' }}>
            Мы соблюдаем Закон Украины «О защите прав потребителей»
          </p>

          {/* Acceptable returns */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <CheckCircle size={22} color="#16a34a" strokeWidth={2} />
              <h2 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Когда можно вернуть товар</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { title: 'Товар надлежащего качества', text: 'В течение 14 дней с момента получения, если товар не использовался, сохранена оригинальная упаковка и товарный вид. Обратная доставка — за счёт покупателя.' },
                { title: 'Ненадлежащее качество или брак', text: 'В любое время в течение срока годности. Расходы на доставку — за счёт FIXLINE. После проверки — обмен или возврат средств.' },
                { title: 'Неправильно отправленный товар', text: 'Если мы отправили не тот артикул или не то количество — возврат и доставка правильного товара полностью за наш счёт.' },
              ].map(({ title, text }) => (
                <div key={title} style={{ paddingLeft: '16px', borderLeft: '3px solid #16a34a' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>{title}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{text}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Non-returnable */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px', marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <XCircle size={22} color="#dc2626" strokeWidth={2} />
              <h2 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Когда возврат невозможен</h2>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                'Товар использовался или вскрыта оригинальная упаковка (если качество в норме)',
                'Прошло 14 дней с момента получения (для товаров надлежащего качества)',
                'Отсутствует чек или подтверждение заказа',
                'Товар повреждён по вине покупателя (удары, механические повреждения)',
              ].map(item => (
                <li key={item} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', gap: '8px', alignItems: 'flex-start', lineHeight: 1.5 }}>
                  <span style={{ color: '#dc2626', flexShrink: 0, marginTop: '2px' }}>✗</span>{item}
                </li>
              ))}
            </ul>
          </div>

          {/* Process */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px', marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <RefreshCw size={22} color="#4880B8" strokeWidth={2} />
              <h2 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Порядок возврата</h2>
            </div>
            <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                { n: '01', title: 'Свяжитесь с нами', text: 'Позвоните или напишите на info@fixline.com.ua с номером заказа и описанием причины возврата.' },
                { n: '02', title: 'Получите подтверждение', text: 'Менеджер согласует условия возврата и сообщит адрес для отправки или организует забор.' },
                { n: '03', title: 'Отправьте товар', text: 'Упакуйте товар в оригинальную или надёжную упаковку и отправьте Новой Почтой. Сохраните ТТН.' },
                { n: '04', title: 'Получите компенсацию', text: 'После проверки товара — возврат средств на карту или счёт в течение 3–5 рабочих дней.' },
              ].map(({ n, title, text }) => (
                <li key={n} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#4880B8', opacity: 0.6, letterSpacing: '0.1em', flexShrink: 0, paddingTop: '2px' }}>{n}</span>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>{title}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{text}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Timing */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', marginBottom: '32px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--border)' }}>
              <Clock size={18} color="#4880B8" strokeWidth={2} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Сроки возврата средств</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                После получения и проверки возвращённого товара — 3–5 рабочих дней для возврата средств на карту. При оплате на счёт — до 7 рабочих дней согласно банковским регламентам.
              </div>
            </div>
          </div>

          {/* Contact */}
          <div style={{ background: '#1E3A5F', borderRadius: '16px', padding: '28px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>Есть вопросы по возврату?</div>
              <div style={{ fontSize: '13px', color: '#94A3B8' }}>Свяжитесь с нами — решим любую ситуацию</div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <a href="tel:+380991997788" style={{ height: '40px', padding: '0 20px', borderRadius: '8px', background: '#4880B8', color: '#fff', fontSize: '13px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}>
                <Phone size={14} /> Позвонить
              </a>
              <a href="mailto:info@fixline.com.ua" style={{ height: '40px', padding: '0 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', color: '#E2E8F0', fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', background: 'transparent' }}>
                Email
              </a>
            </div>
          </div>

        </div>
      </div>
      <Footer />
    </>
  );
}
