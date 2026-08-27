'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Heart, Eye, ShoppingCart, Check } from 'lucide-react';
import ProductImage from './ProductImage';
import WholesaleNoticeModal from './WholesaleNoticeModal';
import { RatingBadge } from './StarRating';
import { getCatIcon, getCatColor, catDescription } from './CategoryCarousel';
import { getCategoryNameRu } from '../../lib/ru';
import { useCart } from '../../lib/cart';
import { useWishlist } from '../../lib/wishlist';
import type { ProductFull, Category, ReviewStats } from '../../lib/supabase';
import type { UserRole } from '../../lib/user-role';

type Bullet = { text: string; textRu: string; slug?: string };

// slug (коли вказаний) — реальна підкатегорія з таблиці categories, на яку веде пункт.
// Без slug — пункт надто загальний (не відповідає одній конкретній підкатегорії), тож
// веде на саму категорію (як і кнопка "Перейти до магазину").
const CAT_BULLETS: Record<string, Bullet[]> = {
  'germetyky': [
    { text: 'Силіконові — універсальні та санітарні', textRu: 'Силиконовые — универсальные и санитарные', slug: 'sylikonovi-germetyky' },
    { text: 'Акрилові — під фарбування, для внутрішніх робіт', textRu: 'Акриловые — под покраску, для внутренних работ', slug: 'akrylovi-germetyky' },
    { text: 'Поліуретанові та нейтральні', textRu: 'Полиуретановые и нейтральные', slug: 'poliuretanovi-germetyky' },
    { text: 'МС-полімерні та жаростійкі', textRu: 'МС-полимерные и жаростойкие', slug: 'ms-polymerni-hermetyky' },
  ],
  'montazhna-pina': [
    { text: 'Піна під пістолет — для проф. застосування', textRu: 'Пена под пистолет — для проф. применения', slug: 'pistoletna-pina' },
    { text: 'Побутова піна — зручне нанесення', textRu: 'Бытовая пена — удобное нанесение', slug: 'pobutova-pina' },
    { text: 'Вогнезахисна піна класу В1', textRu: 'Огнезащитная пена класса В1', slug: 'vohnezakhysna-pina' },
    { text: 'Піна-клей та очисники піни', textRu: 'Пена-клей и очистители пены', slug: 'pina-klei' },
  ],
  'klei': [
    { text: 'Клеї для плитки та монтажний клей', textRu: 'Клеи для плитки и монтажный клей', slug: 'klei-dlya-plytky' },
    { text: 'Клей для шпалер з індикатором', textRu: 'Клей для обоев с индикатором', slug: 'klei-dlya-shpaler' },
    { text: 'ПВА та столярний клей (D2-D4)', textRu: 'ПВА и столярный клей (D2-D4)', slug: 'pva-ta-stolyarnyi' },
    { text: 'Суперклей, епоксидний, контактний', textRu: 'Суперклей, эпоксидный, контактный', slug: 'super-klei' },
  ],
  'farby': [
    { text: 'Водоемульсійні фасадні та інтер\'єрні', textRu: 'Водоэмульсионные фасадные и интерьерные', slug: 'vodoemiulsiyni-fasadni' },
    { text: 'Алкідні фарби та емалі', textRu: 'Алкидные краски и эмали', slug: 'alkidni-farby' },
    { text: 'Лаки, просочення, колоранти', textRu: 'Лаки, пропитки, колеранты', slug: 'laky' },
    { text: 'Розчинники та перетворювачі іржі', textRu: 'Растворители и преобразователи ржавчины', slug: 'rozchynnyky' },
  ],
  'gruntivky': [
    { text: 'Ґрунтовки готові та концентрати', textRu: 'Грунтовки готовые и концентраты', slug: 'gruntivky-gotovi' },
    { text: 'Шпаклівки гіпсові та цементні', textRu: 'Шпаклёвки гипсовые и цементные', slug: 'shpaklivky' },
    { text: 'Бетоноконтакт та адгезійна ґрунт-фарба', textRu: 'Бетоноконтакт и адгезионная грунт-краска', slug: 'betonokontakt' },
    { text: 'Антигрибкові засоби', textRu: 'Противогрибковые средства', slug: 'antygrybok' },
  ],
  'hidroizolyatsiya': [
    { text: 'Бітумні та гідроізол. мастики', textRu: 'Битумные и гидроизол. мастики', slug: 'bitumni-mastyky' },
    { text: 'Праймери для бітумних покриттів', textRu: 'Праймеры для битумных покрытий', slug: 'praimery' },
    { text: 'Ізоляційні стрічки та мембрани', textRu: 'Изоляционные ленты и мембраны', slug: 'izolyatsiyni-strichky' },
    { text: 'Для покрівель, фундаментів, санвузлів', textRu: 'Для кровель, фундаментов, санузлов' },
  ],
  'kriplennya': [
    { text: 'Дюбелі нейлонові та металеві', textRu: 'Дюбели нейлоновые и металлические', slug: 'dyubeli-ta-ankery' },
    { text: 'Анкери для бетону та цегли', textRu: 'Анкеры для бетона и кирпича', slug: 'dyubeli-ta-ankery' },
    { text: 'Шурупи та саморізи для ГК', textRu: 'Шурупы и саморезы для ГКЛ', slug: 'shurupy-ta-samorizy' },
    { text: 'Покриття: оцинковане, фосфатоване', textRu: 'Покрытие: оцинкованное, фосфатированное' },
  ],
  'instrumenty': [
    { text: 'Пістолети для герметика та піни', textRu: 'Пистолеты для герметика и пены', slug: 'pistolety' },
    { text: 'Шпателі та кельми', textRu: 'Шпатели и кельмы', slug: 'shpateli' },
    { text: 'Кисті, валики та малярні інструменти', textRu: 'Кисти, валики и малярный инструмент', slug: 'kysti-ta-valy' },
    { text: 'Шліфувальний та вимірювальний інструмент', textRu: 'Шлифовальный и измерительный инструмент', slug: 'shlifuvalny' },
  ],
  'strichky': [
    { text: 'Герметизуюча бутилова стрічка', textRu: 'Герметизирующая бутиловая лента', slug: 'hermetyzuyucha-strichka' },
    { text: 'Малярна стрічка для чистих меж', textRu: 'Малярная лента для чётких границ', slug: 'malyarna-strichka' },
    { text: 'Стрічка для швів та серпянка', textRu: 'Лента для швов и серпянка', slug: 'strichka-dlya-shviv' },
    { text: 'Звукоізоляційна стрічка Knauf', textRu: 'Звукоизоляционная лента Knauf', slug: 'zvukoizolyatsiyna-strichka' },
  ],
  'plastyfikatory': [
    { text: 'Пластифікатори для бетону та розчинів', textRu: 'Пластификаторы для бетона и растворов', slug: 'plastyfikatory-dlya-betonu' },
    { text: 'Протиморозні добавки', textRu: 'Противоморозные добавки' },
    { text: 'Замінник вапна', textRu: 'Заменитель извести' },
    { text: 'Для теплої підлоги', textRu: 'Для тёплого пола' },
  ],
  'vologopoglinachi': [
    { text: 'Поглиначі вологи Ceresit Stop Волога', textRu: 'Влагопоглотители Ceresit Stop Влага' },
    { text: 'Таблетки змінні Aero 360°', textRu: 'Таблетки сменные Aero 360°' },
    { text: 'Різні аромати та об\'єми', textRu: 'Разные ароматы и объёмы' },
    { text: 'Для приміщень до 20 м²', textRu: 'Для помещений до 20 м²' },
  ],
  'zamazky-dlya-shviv': [
    { text: 'Цементні затирки Ceresit CE33 (шов 1-6 мм)', textRu: 'Цементные затирки Ceresit CE33 (шов 1-6 мм)', slug: 'zamazky-tsementni' },
    { text: 'Еластичні CE40 (шов до 20 мм)', textRu: 'Эластичные CE40 (шов до 20 мм)', slug: 'zamazky-tsementni' },
    { text: '50+ кольорів у асортименті', textRu: '50+ цветов в ассортименте' },
    { text: 'Для керамічної плитки та мозаїки', textRu: 'Для керамической плитки и мозаики' },
  ],
  'zakhyst-derevyny': [
    { text: 'Антисептики від грибка та комах', textRu: 'Антисептики от грибка и насекомых', slug: 'antyseptyki' },
    { text: 'Морилки та тонуючі засоби', textRu: 'Морилки и тонирующие средства', slug: 'morylky' },
    { text: 'Захисні покриття Lotus', textRu: 'Защитные покрытия Lotus', slug: 'zakhysni-pokryttya' },
    { text: 'Для зовнішніх та внутрішніх робіт', textRu: 'Для наружных и внутренних работ' },
  ],
};

function getCatBullets(slug: string): Bullet[] {
  return CAT_BULLETS[slug] ?? [
    { text: 'Широкий вибір продукції для будівництва', textRu: 'Широкий выбор продукции для строительства' },
    { text: 'Оптові ціни для дилерів та підрядників', textRu: 'Оптовые цены для дилеров и подрядчиков' },
    { text: 'Технічна документація та сертифікати', textRu: 'Техническая документация и сертификаты' },
    { text: 'Консультація спеціаліста за запитом', textRu: 'Консультация специалиста по запросу' },
  ];
}

type Props = {
  categories: Category[];
  products: ProductFull[];
  selectedSlug: string;
  role: UserRole;
  reviewStats?: ReviewStats;
};

const navBtnStyle: React.CSSProperties = {
  width: '32px', height: '32px', borderRadius: '8px',
  border: '1px solid var(--border)', background: 'var(--bg-card)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--text-secondary)', flexShrink: 0, cursor: 'pointer',
};

const actionBtnStyle: React.CSSProperties = {
  width: '44px', height: '44px', borderRadius: '10px',
  border: '1px solid var(--border)', background: 'var(--bg-card)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#64748B', flexShrink: 0, cursor: 'pointer',
};

const PAGE_SIZE = 2;

function ProductCard({ product, isRetail, bordered, lang, prefix, rating }: { product: ProductFull; isRetail: boolean; bordered: boolean; lang: 'uk' | 'ru'; prefix: string; rating?: { avg: number; count: number } }) {
  const curMinOrder = isRetail ? 1 : (product.min_order ?? 1);
  const [qty, setQty]           = useState(curMinOrder);
  const [inputVal, setInputVal] = useState(String(curMinOrder));
  const [cartAdded, setCartAdded] = useState(false);
  const { addItem } = useCart();
  const { toggle, isLiked } = useWishlist();

  useEffect(() => {
    setQty(curMinOrder);
    setInputVal(String(curMinOrder));
    setCartAdded(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.sku]);

  const [showWholesaleModal, setShowWholesaleModal] = useState(false);
  // Роздрібна ціна ВСІМ, зокрема оптовику. Головна кешується однією версією для
  // всіх відвідувачів, тож оптових цін у цих даних немає й бути не може —
  // раніше оптовик бачив тут порожнє місце («За запитом»). Свою ціну він
  // побачить у каталозі, куди ведуть кнопки під описом.
  const priceUnit = product.stock?.price_retail ?? 0;
  const priceOld  = product.stock?.price_retail_old ?? null;
  const stockQty  = product.stock?.stock_qty  ?? 0;
  const inStock   = product.stock?.stock_status === 'in_stock' || stockQty > 0;
  const isSale    = priceOld != null && priceUnit > 0 && priceUnit < priceOld;
  const discount  = isSale ? Math.round((1 - priceUnit / priceOld!) * 100) : 0;
  const prodHref  = `${prefix}/product/${product.slug ?? product.sku}`;
  const displayName = lang === 'ru' ? ((product as { name_ru?: string | null }).name_ru ?? product.name) : product.name;

  function handleAddToCart() {
    // Оптовику роздрібну ціну в кошик класти не можна — ведемо його на цей же
    // товар в оптовому каталозі, як це вже робить магазин і сторінка товару.
    if (!isRetail) { setShowWholesaleModal(true); return; }
    addItem({
      sku: product.sku, name: product.name, name_ru: (product as { name_ru?: string | null }).name_ru ?? null,
      brand: product.brand, volume: product.volume,
      price: priceUnit, min_order: curMinOrder,
      nl1: product.nl1 ?? '', nl2: product.nl2 ?? undefined,
      bc: product.bc, ac: product.ac, img_type: product.img_type, imageUrl: product.image ?? undefined,
    }, qty);
    setCartAdded(true);
    setTimeout(() => setCartAdded(false), 1500);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: bordered ? '1px solid var(--border)' : 'none' }}>
      {/* Фіксований блок — назва ліворуч, ціна праворуч. minHeight резервує місце під 2-рядкову назву,
          щоб артикул і статус наявності завжди лежали на одній лінії між сусідніми картками, незалежно
          від того, чи переноситься конкретна назва на другий рядок. */}
      <div style={{ padding: '0 16px 12px', flexShrink: 0, minHeight: '68px', display: 'flex', gap: '8px', alignItems: 'stretch' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <Link href={prodHref} style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3, textDecoration: 'none' }}>{displayName}</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <span style={{ fontSize: '11px', color: '#94A3B8' }}>Арт. {product.sku}</span>
            {rating && rating.count > 0 && <RatingBadge avg={rating.avg} count={rating.count} size={10} />}
          </div>
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            {isSale && <span style={{ display: 'inline-block', background: '#EF4444', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '5px', marginBottom: '2px' }}>−{discount}%</span>}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', justifyContent: 'flex-end' }}>
              {isSale && priceOld && <span style={{ fontSize: '11px', color: '#EF4444', textDecoration: 'line-through', fontWeight: 600 }}>{priceOld}</span>}
              {priceUnit > 0 ? <span style={{ fontSize: '19px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{priceUnit} грн</span> : <span style={{ fontSize: '12px', color: '#94A3B8' }}>{lang === 'ru' ? 'По запросу' : 'За запитом'}</span>}
            </div>
          </div>
          {inStock
            ? <div style={{ fontSize: '11px', color: '#15803D', fontWeight: 600 }}>{lang === 'ru' ? '● в наличии' : '● в наявності'}</div>
            : <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>{lang === 'ru' ? '● нет в наличии' : '● немає в наявності'}</div>}
        </div>
      </div>

      {/* Фото товару */}
      <Link href={prodHref} style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 16px', background: '#fff', overflow: 'hidden' }}>
        <ProductImage brand={product.brand} nl1={product.nl1 ?? ''} nl2={product.nl2 ?? undefined} volume={product.volume ?? ''} bc={product.bc} ac={product.ac} type={product.img_type} imageUrl={product.image ?? undefined} />
      </Link>

      {/* Фіксовані кнопки внизу */}
      <div style={{ padding: '12px 16px 20px', flexShrink: 0, display: 'flex', gap: '6px', alignItems: 'center' }}>
        <button onClick={() => toggle(product.sku)} className="btn-icon" style={{ ...actionBtnStyle, width: '40px', height: '40px', color: isLiked(product.sku) ? '#EF4444' : '#64748B', background: isLiked(product.sku) ? '#FEF2F2' : 'var(--bg-card)', border: `1px solid ${isLiked(product.sku) ? '#FECACA' : 'var(--border)'}` }}>
          <Heart size={15} strokeWidth={2} fill={isLiked(product.sku) ? '#EF4444' : 'none'} />
        </button>
        <input type="number" value={inputVal} min={curMinOrder} onChange={e => setInputVal(e.target.value)} onBlur={() => { const v = parseInt(inputVal, 10); const valid = !isNaN(v) && v >= curMinOrder ? v : curMinOrder; setQty(valid); setInputVal(String(valid)); }} style={{ width: '52px', height: '40px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)', textAlign: 'center', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', outline: 'none' }} />
        <button onClick={handleAddToCart} disabled={!inStock} className={inStock && !cartAdded ? 'btn-primary' : undefined} style={{ flex: 1, height: '40px', borderRadius: '10px', background: cartAdded ? '#16A34A' : !inStock ? '#E2E8F0' : '#4880B8', color: !inStock ? '#94A3B8' : '#fff', border: 'none', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', cursor: !inStock ? 'default' : 'pointer', transition: 'background 0.2s' }}>
          {cartAdded ? <><Check size={14} strokeWidth={2.5} /> {lang === 'ru' ? 'Добавлено' : 'Додано'}</> : !inStock ? (lang === 'ru' ? 'Нет' : 'Немає') : <><ShoppingCart size={14} strokeWidth={2} /> {lang === 'ru' ? 'В корзину' : 'В кошик'}</>}
        </button>
        <Link href={prodHref} className="btn-icon" style={{ ...actionBtnStyle, width: '40px', height: '40px', textDecoration: 'none' }}>
          <Eye size={14} strokeWidth={2} />
        </Link>
      </div>

      {showWholesaleModal && (
        <WholesaleNoticeModal sku={product.sku} lang={lang} onClose={() => setShowWholesaleModal(false)} />
      )}
    </div>
  );
}

export default function CategoryPreview({ categories, products, selectedSlug, role, reviewStats }: Props) {
  const pathname = usePathname();
  const lang: 'uk' | 'ru' = pathname.startsWith('/ru') ? 'ru' : 'uk';
  const prefix = lang === 'ru' ? '/ru' : '';
  const isRetail = role !== 'wholesale';
  const [pageIdx, setPageIdx] = useState(0);

  const catIndex    = categories.findIndex(c => c.slug === selectedSlug);
  const category    = categories[catIndex] ?? categories[0];
  const iconColor   = getCatColor(category?.slug ?? '', catIndex + 1);
  const Icon        = getCatIcon(category?.slug ?? '', catIndex + 1);
  const bullets     = category ? getCatBullets(category.slug) : [];
  const categoryName = category ? (lang === 'ru' ? getCategoryNameRu(category.slug, category.name) : category.name) : '';

  // Підкатегорії обраної категорії
  const subCats = categories.filter(c => c.parent_slug === selectedSlug);
  // Якщо є підкатегорії — спершу по 1 товару з кожної (для різноманіття), а потім
  // добираємо рештою з підкатегорій, де товари ще лишились — інакше порожня
  // підкатегорія (0 товарів) занижує загальну кількість, навіть якщо сусідня
  // підкатегорія має десятки товарів в наявності.
  const catProducts = subCats.length > 0
    ? (() => {
        const primary = subCats.flatMap(sub => products.filter(p => p.category_slug === sub.slug).slice(0, 1));
        const usedSkus = new Set(primary.map(p => p.sku));
        const backfill = subCats.flatMap(sub => products.filter(p => p.category_slug === sub.slug && !usedSkus.has(p.sku)));
        return [...primary, ...backfill];
      })()
    : products.filter(p => p.category_slug === selectedSlug).slice(0, 8);
  const total       = catProducts.length;
  const totalPages  = Math.ceil(total / PAGE_SIZE);

  useEffect(() => {
    setPageIdx(0);
  }, [selectedSlug]);

  const pageStart = pageIdx * PAGE_SIZE;
  const visibleProducts = catProducts.slice(pageStart, pageStart + PAGE_SIZE);
  const pageEnd = pageStart + visibleProducts.length;

  const catHref = isRetail ? `${prefix}/shop/${category?.slug}` : `${prefix}/catalog?category=${category?.slug}`;
  // Дві кнопки внизу лівої панелі: роздріб веде в магазин завжди, опт —
  // у каталог для оптовика і на реєстрацію для решти.
  const shopHref = `${prefix}/shop/${category?.slug}`;
  const wholesaleHref = isRetail ? `${prefix}/opt` : `${prefix}/catalog?category=${category?.slug}`;

  function prev() { setPageIdx(i => Math.max(0, i - 1)); }
  function next() { setPageIdx(i => Math.min(totalPages - 1, i + 1)); }

  if (!category) return null;

  return (
    <>
      {/* ── Left panel — опис категорії ── */}
      <div style={{
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg-page)',
        overflow: 'hidden',
        height: '100%',
      }}>
        {/* Фіксований заголовок — клікабельний, веде туди ж, куди й кнопка внизу */}
        <div style={{ padding: '32px 28px 20px', flexShrink: 0 }}>
          <Link href={catHref} className="cat-preview-header" style={{ display: 'flex', alignItems: 'center', gap: '14px', textDecoration: 'none' }}>
            <div style={{
              width: '52px', height: '52px', borderRadius: '14px', flexShrink: 0,
              background: iconColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={26} color="#fff" strokeWidth={1.75} />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>
              {categoryName}
            </h2>
          </Link>
        </div>

        {/* Опис — центрований по висоті, щоб не лишати порожнечу під коротким списком.
            Кожен пункт клікабельний: веде на свою підкатегорію, якщо вона є, інакше — на саму категорію. */}
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '10px', flex: 1, overflowY: 'auto', scrollbarWidth: 'none', padding: '0 28px' }}>
          {bullets.map((b, i) => {
            const bulletSlug = b.slug ?? category.slug;
            const bulletHref = isRetail ? `${prefix}/shop/${bulletSlug}` : `${prefix}/catalog?category=${bulletSlug}`;
            return (
              <li key={i}>
                <Link href={bulletHref} className="cat-bullet-link" style={{ display: 'flex', gap: '8px', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.55, textDecoration: 'none' }}>
                  <span style={{ color: '#4880B8', fontWeight: 700, flexShrink: 0 }}>•</span>
                  {lang === 'ru' ? b.textRu : b.text}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Фіксовані кнопки внизу: роздріб і опт. Оптовику друга кнопка веде
            одразу в каталог, гостю — на реєстрацію: без акаунта оптових цін
            однаково не побачити, тож посилання прямо в каталог було б глухим. */}
        {/* Рівні половини: ширина по вмісту робила «Оптом» помітно вужчою
            за «До магазину», і пара виглядала випадковою. */}
        <div style={{ padding: '12px 28px 24px', flexShrink: 0, display: 'flex', gap: '10px' }}>
          <Link href={shopHref} className="btn-primary" style={{
            flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            height: '44px', padding: '0 12px', borderRadius: '10px',
            background: '#4880B8', color: '#fff', fontSize: '14px', fontWeight: 700,
            textDecoration: 'none', whiteSpace: 'nowrap',
          }}>
            {lang === 'ru' ? 'В магазин →' : 'До магазину →'}
          </Link>
          <Link href={wholesaleHref} style={{
            flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            height: '44px', padding: '0 12px', borderRadius: '10px',
            border: '1.5px solid var(--border)', background: 'var(--bg-card)',
            color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 700,
            textDecoration: 'none', whiteSpace: 'nowrap',
          }}>
            {lang === 'ru' ? 'Оптом →' : 'Оптом →'}
          </Link>
        </div>
      </div>

      {/* ── Right panel — товари ── */}
      <div style={{ background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>

        {/* Фіксований заголовок — пагінація */}
        <div style={{ padding: '24px 24px 12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            {lang === 'ru' ? 'Примеры товаров' : 'Приклади товарів'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button onClick={prev} disabled={pageIdx === 0} style={{ ...navBtnStyle, color: pageIdx === 0 ? '#CBD5E1' : '#475569', cursor: pageIdx === 0 ? 'default' : 'pointer' }}>
              <ChevronLeft size={15} strokeWidth={2} />
            </button>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569', minWidth: '52px', textAlign: 'center', background: 'var(--bg-soft)', borderRadius: '6px', padding: '3px 8px' }}>
              {total > 0 ? `${pageStart + 1}–${pageEnd} / ${total}` : '—'}
            </span>
            <button onClick={next} disabled={pageEnd >= total} style={{ ...navBtnStyle, color: pageEnd >= total ? '#CBD5E1' : '#475569', cursor: pageEnd >= total ? 'default' : 'pointer' }}>
              <ChevronRight size={15} strokeWidth={2} />
            </button>
          </div>
        </div>

        {visibleProducts.length > 0 ? (
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: visibleProducts.length > 1 ? '1fr 1fr' : '1fr' }}>
            {visibleProducts.map((p, i) => (
              <ProductCard key={p.sku} product={p} isRetail={isRetail} bordered={i === 0 && visibleProducts.length > 1} lang={lang} prefix={prefix} rating={reviewStats?.[p.sku]} />
            ))}
          </div>
        ) : (
          <div style={{ flex: 1, padding: '0 24px' }}>
            <div style={{ background: 'var(--bg-soft)', borderRadius: '14px', padding: '48px 24px', textAlign: 'center', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '15px', color: 'var(--text-muted)' }}>{lang === 'ru' ? 'Нет товаров в этой категории' : 'Немає товарів у цій категорії'}</div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
