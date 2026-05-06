import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Footer from '../../components/Footer';
import { getArticle, ARTICLES } from '../../../lib/blog';
import { ArrowLeft, Clock, Calendar, BookOpen } from 'lucide-react';

export function generateStaticParams() {
  return ARTICLES.map(a => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return {};
  return {
    title: `${article.title} | FIXLINE`,
    description: article.description,
    keywords: article.keywords,
    alternates: { canonical: `https://fixline.com.ua/blog/${slug}` },
    openGraph: {
      title: article.title,
      description: article.description,
      url: `https://fixline.com.ua/blog/${slug}`,
      siteName: 'FIXLINE',
      locale: 'uk_UA',
      type: 'article',
      publishedTime: article.date,
    },
  };
}

// ── Стаття 1 ──────────────────────────────────────────────────────────────────
function ArticleYakVybratyHermetyk() {
  return (
    <>
      <p>Герметик — матеріал, без якого не обходиться жоден ремонт. Але на полицях магазинів десятки видів, і вибрати правильний без підготовки складно. Ця стаття допоможе розібратися.</p>

      <h2>Основні типи герметиків</h2>

      <h3>Силіконовий герметик</h3>
      <p>Найпоширеніший тип. Після затвердіння залишається еластичним, не тріскає від температурних перепадів і витримує прямий контакт з водою. Підходить для:</p>
      <ul>
        <li>Санвузлів і кухонь (ванни, раковини, душові кабіни)</li>
        <li>Ущільнення вікон і скла</li>
        <li>Металевих конструкцій</li>
        <li>Зовнішніх швів на фасаді</li>
      </ul>
      <p><strong>Важливо:</strong> силіконовий герметик не фарбується. Якщо шов треба буде зафарбувати — вибирайте інший тип.</p>
      <p>Різниця між оцтовим і нейтральним: оцтовий (з різким запахом) підходить для скла і кераміки, нейтральний — для мармуру, натурального каменю і металу. Агресивне середовище оцтового герметика роз'їдає деякі матеріали.</p>

      <h3>Акриловий герметик</h3>
      <p>Акриловий герметик на водній основі — майже без запаху і легко фарбується після висихання. Ідеальний для:</p>
      <ul>
        <li>Стиків плінтусів і підлоги</li>
        <li>Заповнення тріщин у штукатурці</li>
        <li>Ущільнення вікон зсередини перед фарбуванням</li>
        <li>Стиків гіпсокартонних конструкцій</li>
      </ul>
      <p><strong>Обмеження:</strong> не підходить для вологих приміщень і зовнішніх робіт — при постійному контакті з водою розм'якшується і вимивається.</p>

      <h3>Поліуретановий герметик</h3>
      <p>Найміцніший серед еластичних герметиків. Витримує механічні навантаження, вібрацію та хімічно агресивне середовище. Застосовують для:</p>
      <ul>
        <li>Фасадних і деформаційних швів</li>
        <li>Бетонних і металевих конструкцій</li>
        <li>Монтажу покрівельних елементів</li>
        <li>Промислових об'єктів</li>
      </ul>
      <p>На відміну від силіконового, поліуретановий герметик можна шліфувати і фарбувати після затвердіння.</p>

      <h3>МС-полімерний герметик</h3>
      <p>Відносно новий матеріал, який поєднує переваги силіконових і поліуретанових герметиків. Без токсичних розчинників, фарбується, еластичний і міцний. Ідеально для складних фасадних робіт, де потрібна і естетика, і надійність.</p>

      <h2>Як вибрати правильний герметик: коротка таблиця</h2>
      <table>
        <thead>
          <tr><th>Задача</th><th>Рекомендований тип</th></tr>
        </thead>
        <tbody>
          <tr><td>Ванна, душ, раковина</td><td>Силіконовий (нейтральний або протигрибковий)</td></tr>
          <tr><td>Вікна зсередини + фарбування</td><td>Акриловий</td></tr>
          <tr><td>Тріщини в стінах</td><td>Акриловий або акрилово-силіконовий</td></tr>
          <tr><td>Фасадні шви</td><td>Поліуретановий або МС-полімерний</td></tr>
          <tr><td>Покрівля</td><td>Бітумний або поліуретановий</td></tr>
          <tr><td>Мармур і натуральний камінь</td><td>Силіконовий нейтральний</td></tr>
        </tbody>
      </table>

      <h2>На що звертати увагу при покупці</h2>
      <ol>
        <li><strong>Умови застосування</strong> — внутрішні/зовнішні роботи, вологість, температура</li>
        <li><strong>Матеріал основи</strong> — чи сумісний герметик з вашим матеріалом</li>
        <li><strong>Фарбування</strong> — чи потрібно фарбувати шов після нанесення</li>
        <li><strong>Еластичність після затвердіння</strong> — для рухомих швів потрібна висока еластичність</li>
        <li><strong>Час висихання</strong> — через скільки годин шов витримає контакт з водою</li>
      </ol>

      <h2>Типові помилки</h2>
      <ul>
        <li>Наносять герметик на вологу або брудну поверхню — адгезія різко знижується</li>
        <li>Не знімають старий герметик перед нанесенням нового — шов тримається погано</li>
        <li>Використовують акриловий у ванній — через 3–6 місяців починає відставати і чорніти</li>
        <li>Купують без запасу — якщо не вистачить, відтінок нової туби може відрізнятися</li>
      </ul>
    </>
  );
}

// ── Стаття 2 ──────────────────────────────────────────────────────────────────
function ArticleMontazhna() {
  return (
    <>
      <p>Монтажна піна — один із найзручніших матеріалів у ремонті. Але неправильно підібрана або нанесена піна може зіпсувати роботу. Розбираємося у всіх нюансах.</p>

      <h2>Що таке монтажна піна</h2>
      <p>Монтажна піна — однокомпонентний поліуретановий матеріал у балоні під тиском. Після виходу з балона реагує з вологою повітря, розширюється і затвердіває. Утворює пористу масу з хорошими теплоізоляційними та шумозахисними властивостями.</p>

      <h2>Побутова проти професійної піни</h2>
      <h3>Побутова (без адаптера)</h3>
      <p>Зручна — наносять без пістолета, просто натискають на трубочку. Але:</p>
      <ul>
        <li>Коефіцієнт розширення вищий — складно контролювати кількість</li>
        <li>Після відкриття балон швидко засихає і стає непридатним</li>
        <li>Менш зручна для точного нанесення</li>
      </ul>

      <h3>Професійна (під пістолет)</h3>
      <p>Вимагає монтажного пістолета, але переваги суттєві:</p>
      <ul>
        <li>Точне нанесення в будь-якому положенні (навіть перевернуто)</li>
        <li>Регулювання кількості на ручці пістолета</li>
        <li>Балон можна закрити і використати повторно через тижні</li>
        <li>Нижче первинне розширення — менше надлишків</li>
      </ul>
      <p>Якщо плануєте встановити більш ніж 2–3 вікна або двері — пістолет окупиться і суттєво спростить роботу.</p>

      <h2>Літня та зимова піна</h2>
      <p>Стандартна піна працює при температурах від +5 до +35°C. При нижчих температурах реакція затвердіння сповільнюється або зупиняється.</p>
      <p><strong>Зимова піна</strong> розроблена для роботи при температурах від −15 до −20°C. Ключові особливості:</p>
      <ul>
        <li>Добавки, що прискорюють реакцію при низьких температурах</li>
        <li>Балон потрібно прогріти до +20°C перед використанням (кишеня куртки або тепла вода)</li>
        <li>Поверхня також повинна бути не замерзлою і злегка зволоженою</li>
      </ul>

      <h2>Вибір за коефіцієнтом розширення</h2>
      <p>Виробники вказують максимальний вихід піни в літрах. Але реальний вихід залежить від температури та вологості. Правило: беріть піни на 20–30% більше за розрахунок.</p>
      <ul>
        <li><strong>Низьке розширення</strong> — для вузьких щілин і монтажу вікон у міжсезоння</li>
        <li><strong>Стандартне</strong> — монтаж вікон і дверей влітку</li>
        <li><strong>Вогнестійка піна</strong> — для протипожежних перегородок і монтажу дверей у пожежних виходах</li>
      </ul>

      <h2>Як правильно наносити монтажну піну</h2>
      <ol>
        <li><strong>Підготовка балона.</strong> Злегка потрясіть 30–60 секунд — це змішує компоненти.</li>
        <li><strong>Зволожте поверхню.</strong> Збризніть шов водою — це прискорить затвердіння і покращить адгезію.</li>
        <li><strong>Заповнюйте на 1/2 глибини.</strong> Піна розшириться і заповнить решту. Якщо перестаратися — її надлишки зможуть деформувати конструкцію.</li>
        <li><strong>Не чіпайте 4–6 годин.</strong> Рання механічна дія порушує структуру піни.</li>
        <li><strong>Обріжте та заґрунтуйте.</strong> Затверділу піну потрібно захистити від UV-випромінювання — вона жовтіє і руйнується на сонці.</li>
      </ol>

      <h2>Типові помилки</h2>
      <ul>
        <li><strong>Не трясуть балон</strong> — піна виходить нерівномірною і швидко засихає в трубочці</li>
        <li><strong>Наносять на суху поверхню</strong> — знижує адгезію на 30–40%</li>
        <li><strong>Залишають піну без захисту</strong> — через 2–4 тижні на сонці починає кришитися</li>
        <li><strong>Не чистять пістолет після роботи</strong> — засихає і псується</li>
        <li><strong>Використовують литню піну в мороз</strong> — не затвердіє або затвердіє неправильно</li>
      </ul>

      <h2>Чим почистити монтажну піну</h2>
      <p>Свіжу піну знімають ганчіркою або ацетоном. Затверділу — тільки механічно (ніж, шпатель). Спеціальний розчинник для піни ("Очищувач піни") розм'якшує засохлий матеріал — але тільки протягом 12 годин після нанесення. Повністю затверділу піну жоден розчинник не бере.</p>
    </>
  );
}

const ARTICLE_CONTENT: Record<string, () => React.JSX.Element> = {
  'yak-vybrat-hermetyk': ArticleYakVybratyHermetyk,
  'montazhna-pina-yak-vykorystovuvaty': ArticleMontazhna,
};

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const Content = ARTICLE_CONTENT[slug];
  if (!Content) notFound();

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    datePublished: article.date,
    dateModified: article.date,
    author: { '@type': 'Organization', name: 'FIXLINE' },
    publisher: { '@type': 'Organization', name: 'FIXLINE', url: 'https://fixline.com.ua' },
    url: `https://fixline.com.ua/blog/${slug}`,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '40px 32px 64px' }}>

          {/* Back */}
          <Link href="/blog" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '28px' }}>
            <ArrowLeft size={14} /> Всі статті
          </Link>

          {/* Meta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: '#EFF6FF', color: '#4880B8' }}>
              {article.category}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} /> {article.readTime} хв читання
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={12} /> {new Date(article.date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>

          {/* Title */}
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3, margin: '0 0 12px' }}>
            {article.title}
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 32px' }}>
            {article.description}
          </p>

          {/* Content */}
          <div className="article-body">
            <Content />
          </div>

          {/* CTA */}
          <div style={{ marginTop: '48px', padding: '24px 28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Знайдіть потрібний матеріал у нашому каталозі
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.6 }}>
              Широкий вибір герметиків, монтажних пін та клеїв від перевірених виробників. Від 1 одиниці.
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <Link href="/shop" style={{ height: '38px', padding: '0 18px', borderRadius: '8px', background: '#4880B8', color: '#fff', fontSize: '13px', fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>
                До магазину
              </Link>
              <Link href="/blog" style={{ height: '38px', padding: '0 18px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
                Інші статті
              </Link>
            </div>
          </div>

        </div>
      </div>
      <Footer />
      <style>{`
        .article-body { font-size: 15px; color: var(--text-secondary); line-height: 1.8; }
        .article-body h2 { font-size: 20px; font-weight: 800; color: var(--text-primary); margin: 32px 0 12px; }
        .article-body h3 { font-size: 16px; font-weight: 700; color: var(--text-primary); margin: 20px 0 8px; }
        .article-body p { margin: 0 0 14px; }
        .article-body ul, .article-body ol { padding-left: 22px; margin: 0 0 14px; }
        .article-body li { margin-bottom: 6px; }
        .article-body strong { color: var(--text-primary); font-weight: 600; }
        .article-body table { width: 100%; border-collapse: collapse; margin: 16px 0 20px; font-size: 14px; }
        .article-body th { background: var(--bg-soft); padding: 10px 14px; text-align: left; font-weight: 600; color: var(--text-primary); border: 1px solid var(--border); }
        .article-body td { padding: 10px 14px; border: 1px solid var(--border); color: var(--text-secondary); }
        .article-body tr:nth-child(even) td { background: var(--bg-soft); }
      `}</style>
    </>
  );
}
