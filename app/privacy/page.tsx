import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../components/Footer';
import Reveal from '../components/Reveal';
import { ShieldCheck, Database, Share2, Cookie, UserCheck, Phone } from 'lucide-react';
import { SELLER } from '../../lib/company';

// Політика конфіденційності — публічна сторінка, обов'язкова для магазину за
// Законом «Про захист персональних даних» і для OAuth-застосунків Google
// (без публічного посилання застосунок не публікується). Текст описує те, що
// сайт робить насправді: дані замовлення, перевізники, оплата, аналітика без cookie.

const BASE = 'https://fixline.com.ua';
const UPDATED = '17 жовтня 2026 р.';

export const metadata: Metadata = {
  title: 'Політика конфіденційності',
  description: 'Які персональні дані збирає FIXLINE при оформленні замовлення, кому вони передаються (перевізники, платіжні сервіси, маркетплейси), як зберігаються і які права має покупець.',
  alternates: { canonical: `${BASE}/privacy`, languages: { 'uk': `${BASE}/privacy`, 'ru': `${BASE}/ru/privacy`, 'x-default': `${BASE}/privacy` } },
  openGraph: {
    title: 'Політика конфіденційності — FIXLINE',
    description: 'Які дані ми збираємо, навіщо, кому передаємо і як їх захищаємо.',
    url: `${BASE}/privacy`,
    siteName: 'FIXLINE',
    locale: 'uk_UA',
    type: 'website',
    images: [{ url: `${BASE}/opengraph-image`, width: 1200, height: 630, alt: 'FIXLINE — будівельна хімія' }],
  },
};

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px', marginBottom: '20px' };
const h2: React.CSSProperties = { fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 };
const p: React.CSSProperties = { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 };
const itemTitle: React.CSSProperties = { fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' };

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
        {icon}
        <h2 style={h2}>{title}</h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>{children}</div>
    </div>
  );
}

function Item({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ paddingLeft: '16px', borderLeft: '3px solid #4880B8' }}>
      <div style={itemTitle}>{title}</div>
      <div style={p}>{text}</div>
    </div>
  );
}

export default function PrivacyPage() {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Головна', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Політика конфіденційності', item: `${BASE}/privacy` },
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
            <span>Політика конфіденційності</span>
          </nav>

          <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>Політика конфіденційності</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '48px' }}>
            Діє відповідно до Закону України «Про захист персональних даних». Оновлено {UPDATED}.
          </p>

          <Reveal>
          <Section icon={<ShieldCheck size={22} color="#4880B8" strokeWidth={2} />} title="Хто обробляє дані">
            <p style={p}>
              Володілець і розпорядник персональних даних — FIXLINE (реквізити наведено внизу сторінки).
              Сайт fixline.com.ua — інтернет-магазин будівельної хімії. Оформлюючи замовлення, реєструючись у кабінеті або звертаючись
              до нас, ви надаєте згоду на обробку своїх даних на умовах цієї політики.
            </p>
          </Section>
          </Reveal>

          <Reveal>
          <Section icon={<Database size={22} color="#4880B8" strokeWidth={2} />} title="Які дані ми збираємо і навіщо">
            <Item title="Дані замовлення" text="Ім'я, телефон, електронна пошта, місто і відділення чи адреса доставки, склад замовлення. Без них неможливо прийняти замовлення, відправити товар і повідомити про його рух." />
            <Item title="Дані для документів" text="Для юридичних осіб і ФОП — назва, код ЄДРПОУ/РНОКПП, реквізити, потрібні для рахунку й видаткової накладної. Зберігаються стільки, скільки вимагає податкове законодавство для первинних документів." />
            <Item title="Кабінет покупця" text="Електронна пошта і пароль (зберігається лише у зашифрованому вигляді), історія замовлень, збережені адреси. Партнери дропшипінгу та оптові покупці додатково бачать свої ціни й баланс." />
            <Item title="Звернення" text="Листи, повідомлення в чатах маркетплейсів і Telegram, дзвінки — щоб відповісти вам і вирішити питання по замовленню." />
            <Item title="Технічні дані" text="IP-адреса, тип браузера, сторінки й джерело переходу (у тому числі мітки рекламних кампаній). Використовуються для безпеки, статистики відвідувань і оцінки ефективності реклами." />
          </Section>
          </Reveal>

          <Reveal>
          <Section icon={<Share2 size={22} color="#4880B8" strokeWidth={2} />} title="Кому передаються дані">
            <Item title="Перевізники" text="«Нова Пошта» і «ROZETKA Доставка» отримують ім'я, телефон і адресу одержувача, щоб доставити відправлення та повідомляти про його статус." />
            <Item title="Платіжні сервіси" text="Оплата карткою проходить на стороні банку (Monobank / Universal Bank). Ми не бачимо і не зберігаємо реквізити вашої картки, отримуємо лише підтвердження платежу." />
            <Item title="Маркетплейси" text="Якщо замовлення зроблене на Prom.ua, Rozetka чи «Епіцентр», дані замовлення надходять до нас із цих площадок і обробляються також за їхніми правилами." />
            <Item title="Технічні підрядники" text="Хостинг, база даних, поштовий сервіс і сервіс сповіщень обробляють дані від нашого імені за договорами й не використовують їх для власних цілей." />
            <p style={p}>
              Ми не продаємо персональні дані і не передаємо їх третім особам для їхнього маркетингу. Передача державним органам —
              лише у випадках, прямо передбачених законом.
            </p>
          </Section>
          </Reveal>

          <Reveal>
          <Section icon={<Cookie size={22} color="#4880B8" strokeWidth={2} />} title="Cookie та аналітика">
            <Item title="Необхідні" text="Сесія кабінету, вміст кошика, вибрана мова. Без них сайт не працює, згода на них не потрібна." />
            <Item title="Статистика" text="Відвідуваність рахується через Vercel Analytics — без cookie і без ідентифікації особи." />
            <Item title="Реклама" text="При переході з Google Ads зберігається ідентифікатор кліку, щоб ми бачили, які оголошення приводять до замовлень. Він не містить ваших особистих даних і не використовується для профілювання." />
          </Section>
          </Reveal>

          <Reveal>
          <Section icon={<UserCheck size={22} color="#4880B8" strokeWidth={2} />} title="Зберігання і ваші права">
            <Item title="Строк зберігання" text="Дані замовлень і документів — протягом строків, встановлених податковим і бухгалтерським законодавством (щонайменше 3 роки). Дані кабінету — поки існує обліковий запис. Технічні журнали — до 12 місяців." />
            <Item title="Захист" text="Дані зберігаються на захищених серверах із шифруванням каналів зв'язку і розмежуванням доступу. Доступ мають лише працівники, яким він потрібен для обробки замовлень." />
            <Item title="Ваші права" text="Ви можете дізнатися, які дані ми про вас маємо, виправити їх, відкликати згоду або вимагати видалення (крім даних, які ми зобов'язані зберігати за законом). Для цього напишіть на info@fixline.com.ua з адреси, вказаної в замовленні." />
            <Item title="Зміни політики" text="Оновлена редакція публікується на цій сторінці із зазначенням дати. Істотні зміни ми окремо повідомляємо зареєстрованим покупцям." />
          </Section>
          </Reveal>

          <Reveal>
          <div style={{ background: '#1E3A5F', borderRadius: '16px', padding: '28px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>Питання щодо ваших даних?</div>
              <div style={{ fontSize: '13px', color: '#94A3B8' }}>Відповімо протягом 10 робочих днів</div>
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
          </Reveal>

          <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.6, margin: '28px 0 0' }}>
            Володілець персональних даних: {SELLER.name}, РНОКПП {SELLER.edrpou}, {SELLER.city}.
          </p>

        </div>
      </div>
      <Footer />
    </>
  );
}
