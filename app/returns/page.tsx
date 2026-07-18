import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../components/Footer';
import { RefreshCw, CheckCircle, XCircle, Phone, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Політика повернення',
  description: 'Умови повернення та обміну товарів FIXLINE. 14 днів на повернення товару належної якості. Строки, порядок дій та умови для B2B клієнтів.',
  keywords: ['повернення товару', 'обмін товару', 'політика повернення будівельна хімія', 'возврат товара'],
  alternates: { canonical: 'https://fixline.com.ua/returns', languages: { 'uk': 'https://fixline.com.ua/returns', 'ru': 'https://fixline.com.ua/ru/returns', 'x-default': 'https://fixline.com.ua/returns' } },
  openGraph: {
    title: 'Політика повернення — FIXLINE',
    description: 'Умови повернення та обміну товарів. 14 днів на повернення товару належної якості.',
    url: 'https://fixline.com.ua/returns',
    siteName: 'FIXLINE',
    locale: 'uk_UA',
    type: 'website',
    images: [{ url: 'https://fixline.com.ua/opengraph-image', width: 1200, height: 630, alt: 'FIXLINE — будівельна хімія' }],
  },
};

export default function ReturnsPage() {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Головна', item: 'https://fixline.com.ua' },
      { '@type': 'ListItem', position: 2, name: 'Політика повернення', item: 'https://fixline.com.ua/returns' },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '48px 32px 80px' }}>

          <nav style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '24px', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <Link href="/" style={{ color: '#94A3B8', textDecoration: 'none' }}>Головна</Link>
            <span>/</span>
            <span>Політика повернення</span>
          </nav>

          <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>Політика повернення</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '48px' }}>
            Ми дотримуємось Закону України «Про захист прав споживачів»
          </p>

          {/* Acceptable returns */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <CheckCircle size={22} color="#16a34a" strokeWidth={2} />
              <h2 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Коли можна повернути товар</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { title: 'Товар належної якості', text: 'Протягом 14 днів з дня отримання, якщо товар не використовувався, збережена оригінальна упаковка та товарний вигляд. Зворотня доставка — за рахунок покупця.' },
                { title: 'Неналежна якість або брак', text: 'У будь-який час протягом терміну придатності. Витрати на доставку — за рахунок FIXLINE. Після перевірки — обмін або повернення коштів.' },
                { title: 'Неправильно відправлений товар', text: 'Якщо ми відправили не той артикул або не ту кількість — повернення та доставка правильного товару повністю за наш рахунок.' },
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
              <h2 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Коли повернення неможливе</h2>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                'Товар використовувався або розкрита оригінальна упаковка (якщо якість у нормі)',
                'Минуло 14 днів з моменту отримання (для товарів належної якості)',
                'Відсутній чек або підтвердження замовлення',
                'Товар пошкоджений з вини покупця (удари, механічні пошкодження)',
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
              <h2 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Порядок повернення</h2>
            </div>
            <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                { n: '01', title: 'Зв\'яжіться з нами', text: 'Зателефонуйте або напишіть на info@fixline.com.ua з номером замовлення та описом причини повернення.' },
                { n: '02', title: 'Отримайте підтвердження', text: 'Менеджер погодить умови повернення та повідомить адресу для відправки або організує забір.' },
                { n: '03', title: 'Відправте товар', text: 'Упакуйте товар в оригінальну або надійну упаковку та відправте Новою Поштою. Збережіть ТТН.' },
                { n: '04', title: 'Отримайте компенсацію', text: 'Після перевірки товару — повернення коштів на картку або рахунок протягом 3–5 робочих днів.' },
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
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Строки повернення коштів</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Після отримання та перевірки поверненого товару — 3–5 робочих днів для повернення коштів на картку. При оплаті на рахунок — до 7 робочих днів відповідно до банківських регламентів.
              </div>
            </div>
          </div>

          {/* Contact */}
          <div style={{ background: '#1E3A5F', borderRadius: '16px', padding: '28px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>Маєте питання щодо повернення?</div>
              <div style={{ fontSize: '13px', color: '#94A3B8' }}>Зв&apos;яжіться з нами — вирішимо будь-яку ситуацію</div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <a href="tel:+380991997788" style={{ height: '40px', padding: '0 20px', borderRadius: '8px', background: '#4880B8', color: '#fff', fontSize: '13px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}>
                <Phone size={14} /> Зателефонувати
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
