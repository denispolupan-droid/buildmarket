import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../../components/Footer';
import Reveal from '../../components/Reveal';
import { ShieldCheck, Database, Share2, Cookie, UserCheck, Phone } from 'lucide-react';
import { SELLER } from '../../../lib/company';

// Русская версия /privacy — тот же текст, та же структура.

const BASE = 'https://fixline.com.ua';
const UPDATED = '17 октября 2026 г.';

export const metadata: Metadata = {
  title: 'Политика конфиденциальности',
  description: 'Какие персональные данные собирает FIXLINE при оформлении заказа, кому они передаются (перевозчики, платёжные сервисы, маркетплейсы), как хранятся и какие права есть у покупателя.',
  alternates: { canonical: `${BASE}/ru/privacy`, languages: { 'uk': `${BASE}/privacy`, 'ru': `${BASE}/ru/privacy`, 'x-default': `${BASE}/privacy` } },
  openGraph: {
    title: 'Политика конфиденциальности — FIXLINE',
    description: 'Какие данные мы собираем, зачем, кому передаём и как защищаем.',
    url: `${BASE}/ru/privacy`,
    siteName: 'FIXLINE',
    locale: 'ru_RU',
    type: 'website',
    images: [{ url: `${BASE}/opengraph-image`, width: 1200, height: 630, alt: 'FIXLINE — строительная химия' }],
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

export default function PrivacyRuPage() {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${BASE}/ru` },
      { '@type': 'ListItem', position: 2, name: 'Политика конфиденциальности', item: `${BASE}/ru/privacy` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '48px 32px 80px' }}>

          <nav style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '24px', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <Link href="/ru" style={{ color: '#94A3B8', textDecoration: 'none' }}>Главная</Link>
            <span>/</span>
            <span>Политика конфиденциальности</span>
          </nav>

          <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>Политика конфиденциальности</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '48px' }}>
            Действует в соответствии с Законом Украины «О защите персональных данных». Обновлено {UPDATED}.
          </p>

          <Reveal>
          <Section icon={<ShieldCheck size={22} color="#4880B8" strokeWidth={2} />} title="Кто обрабатывает данные">
            <p style={p}>
              Владелец и распорядитель персональных данных — FIXLINE (реквизиты приведены внизу страницы).
              Сайт fixline.com.ua — интернет-магазин строительной химии. Оформляя заказ, регистрируясь в кабинете или обращаясь
              к нам, вы даёте согласие на обработку своих данных на условиях этой политики.
            </p>
          </Section>
          </Reveal>

          <Reveal>
          <Section icon={<Database size={22} color="#4880B8" strokeWidth={2} />} title="Какие данные мы собираем и зачем">
            <Item title="Данные заказа" text="Имя, телефон, электронная почта, город и отделение или адрес доставки, состав заказа. Без них невозможно принять заказ, отправить товар и сообщить о его движении." />
            <Item title="Данные для документов" text="Для юридических лиц и ФЛП — название, код ЕГРПОУ/РНОКПП, реквизиты, нужные для счёта и расходной накладной. Хранятся столько, сколько требует налоговое законодательство для первичных документов." />
            <Item title="Кабинет покупателя" text="Электронная почта и пароль (хранится только в зашифрованном виде), история заказов, сохранённые адреса. Партнёры дропшиппинга и оптовые покупатели дополнительно видят свои цены и баланс." />
            <Item title="Обращения" text="Письма, сообщения в чатах маркетплейсов и Telegram, звонки — чтобы ответить вам и решить вопрос по заказу." />
            <Item title="Технические данные" text="IP-адрес, тип браузера, страницы и источник перехода (в том числе метки рекламных кампаний). Используются для безопасности, статистики посещений и оценки эффективности рекламы." />
          </Section>
          </Reveal>

          <Reveal>
          <Section icon={<Share2 size={22} color="#4880B8" strokeWidth={2} />} title="Кому передаются данные">
            <Item title="Перевозчики" text="«Нова Пошта» и «ROZETKA Доставка» получают имя, телефон и адрес получателя, чтобы доставить отправление и сообщать о его статусе." />
            <Item title="Платёжные сервисы" text="Оплата картой проходит на стороне банка (Monobank / Universal Bank). Мы не видим и не храним реквизиты вашей карты, получаем только подтверждение платежа." />
            <Item title="Маркетплейсы" text="Если заказ сделан на Prom.ua, Rozetka или «Эпицентр», данные заказа поступают к нам с этих площадок и обрабатываются также по их правилам." />
            <Item title="Технические подрядчики" text="Хостинг, база данных, почтовый сервис и сервис уведомлений обрабатывают данные от нашего имени по договорам и не используют их для собственных целей." />
            <p style={p}>
              Мы не продаём персональные данные и не передаём их третьим лицам для их маркетинга. Передача государственным органам —
              только в случаях, прямо предусмотренных законом.
            </p>
          </Section>
          </Reveal>

          <Reveal>
          <Section icon={<Cookie size={22} color="#4880B8" strokeWidth={2} />} title="Cookie и аналитика">
            <Item title="Необходимые" text="Сессия кабинета, содержимое корзины, выбранный язык. Без них сайт не работает, согласие на них не требуется." />
            <Item title="Статистика" text="Посещаемость считается через Vercel Analytics — без cookie и без идентификации личности." />
            <Item title="Реклама" text="При переходе из Google Ads сохраняется идентификатор клика, чтобы мы видели, какие объявления приводят к заказам. Он не содержит ваших личных данных и не используется для профилирования." />
          </Section>
          </Reveal>

          <Reveal>
          <Section icon={<UserCheck size={22} color="#4880B8" strokeWidth={2} />} title="Хранение и ваши права">
            <Item title="Срок хранения" text="Данные заказов и документов — в течение сроков, установленных налоговым и бухгалтерским законодательством (не менее 3 лет). Данные кабинета — пока существует учётная запись. Технические журналы — до 12 месяцев." />
            <Item title="Защита" text="Данные хранятся на защищённых серверах с шифрованием каналов связи и разграничением доступа. Доступ имеют только сотрудники, которым он нужен для обработки заказов." />
            <Item title="Ваши права" text="Вы можете узнать, какие данные мы о вас имеем, исправить их, отозвать согласие или потребовать удаления (кроме данных, которые мы обязаны хранить по закону). Для этого напишите на info@fixline.com.ua с адреса, указанного в заказе." />
            <Item title="Изменения политики" text="Обновлённая редакция публикуется на этой странице с указанием даты. О существенных изменениях мы отдельно сообщаем зарегистрированным покупателям." />
          </Section>
          </Reveal>

          <Reveal>
          <div style={{ background: '#1E3A5F', borderRadius: '16px', padding: '28px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>Вопросы о ваших данных?</div>
              <div style={{ fontSize: '13px', color: '#94A3B8' }}>Ответим в течение 10 рабочих дней</div>
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
          </Reveal>

          <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.6, margin: '28px 0 0' }}>
            Владелец персональных данных: {SELLER.name}, РНОКПП {SELLER.edrpou}, {SELLER.city}.
          </p>

        </div>
      </div>
      <Footer />
    </>
  );
}
