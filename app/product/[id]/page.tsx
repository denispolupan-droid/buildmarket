import ProductImage from '../../components/ProductImage'

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Mock product catalogue — in production, fetch by id from DB/API
  const catalogue: Record<string, {
    brand: string; name: string; sku: string; volume: string;
    type: string; color: string; stock: string; stockQty: number;
    minOrder: number; packQty: number;
    priceUnit: number; priceOld: number | null; category: string;
    description: string;
    nl1: string; nl2?: string; bc: string; ac: string;
    imgType: 'tube' | 'canister';
    characteristics: { label: string; value: string }[];
  }> = {
    '1': {
      brand: 'FIXHUB', name: 'ТЕРМЕНА 65 ПРО', sku: 'FX-T65PRO-650',
      volume: '650 мл', type: 'Термостійкий', color: 'Чорний',
      stock: 'Є з наявності', stockQty: 24,
      minOrder: 12, packQty: 12, priceUnit: 279, priceOld: null,
      nl1: 'ТЕРМЕНА', nl2: '65 ПРО', bc: '#1E2233', ac: '#8B2020', imgType: 'tube',
      category: 'Герметики',
      description: 'ТЕРМЕНА 65 ПРО — професійний термостійкий герметик для ущільнення швів у печах, камінах, котлах та інших поверхнях із підвищеною температурою. Витримує від −40°C до +1500°C після повної полімеризації.\n\nЗастосовується для заповнення та ущільнення швів між вогнетривкими матеріалами, трубами та конструкціями, що піддаються впливу температур. Відмінна адгезія до металу, кераміки, цегли, бетону.',
      characteristics: [
        { label: "Об'єм", value: '650 мл' },
        { label: 'Тип', value: 'Термостійкий силіконовий' },
        { label: 'Колір', value: 'Чорний' },
        { label: 'Темп. застосування', value: 'від +5°C до +40°C' },
        { label: 'Темп. експлуатації', value: 'від −40°C до +1500°C' },
        { label: 'Час висихання', value: '24 год (при +23°C, 50% вол.)' },
        { label: 'База', value: 'Силіконова' },
        { label: 'Упаковка', value: '12 шт / уп' },
        { label: 'Артикул', value: 'FX-T65PRO-650' },
      ],
    },
    '2': {
      brand: 'FIXHUB', name: 'Акриловий герметик', sku: 'FX-ACR-260',
      volume: '260 мл', type: 'Акриловий', color: 'Білий',
      stock: 'Є з наявності', stockQty: 12,
      minOrder: 12, packQty: 12, priceUnit: 119, priceOld: null,
      nl1: 'Акриловий', nl2: 'герметик', bc: '#C4D4E8', ac: '#2A5090', imgType: 'tube' as const,
      category: 'Герметики',
      description: 'Акриловий герметик FIXHUB — універсальний засіб для внутрішніх і зовнішніх робіт. Легко наноситься, добре фарбується після висихання, не жовтіє.',
      characteristics: [
        { label: "Об'єм", value: '260 мл' },
        { label: 'Тип', value: 'Акриловий' },
        { label: 'Колір', value: 'Білий' },
        { label: 'Темп. застосування', value: 'від +5°C до +35°C' },
        { label: 'Час висихання', value: '30 хв' },
        { label: 'Упаковка', value: '12 шт / уп' },
        { label: 'Артикул', value: 'FX-ACR-260' },
      ],
    },
  };

  const product = catalogue[id] ?? catalogue['1'];

  const pricePack = product.priceUnit * product.packQty;

  const related = [
    { id:'2', brand:'FIXHUB', nl1:'Акриловий', nl2:'герметик', bc:'#C4D4E8', ac:'#2A5090', imgType:'tube' as const,
      name:'Акриловий герметик', volume:'260 мл', stock:'Є з наявності: 12 шт', minOrder:'12 шт', priceUnit:'119 грн', pricePack:'1 428 грн / уп' },
    { id:'3', brand:'FIXHUB', nl1:'ЖИДКІ ЦВЯХИ', nl2:'EXPERT', bc:'#201C10', ac:'#C09020', imgType:'tube' as const,
      name:'ЖИДКІ ЦВЯХИ EXPERT', volume:'370 мл', stock:'Є з наявності: 24 шт', minOrder:'6 шт', priceUnit:'139 грн', pricePack:'834 грн / уп' },
    { id:'5', brand:'KUDO', nl1:'Силкон', nl2:'Санітарний', bc:'#C8E0D0', ac:'#287850', imgType:'tube' as const,
      name:'Силкон Санітарний', volume:'290 мл', stock:'Є з наявності: 12 шт', minOrder:'12 шт', priceUnit:'109 грн', pricePack:'1 308 грн / уп' },
  ];

  const css = `
    :root {
      --bg-page: #F6F8FB;
      --bg-card: #FFFFFF;
      --bg-soft: #EEF2F6;
      --border: #D9E0E8;
      --text-primary: #22324A;
      --text-secondary: #5E6E84;
      --text-muted: #8895A7;
      --brand-main: #4F637A;
      --brand-accent: #B8962E;
      --btn-primary-bg: #AFC4DA;
      --btn-primary-bg-hover: #9EB6CF;
      --btn-primary-text: #22324A;
      --status-instock: #6BAE57;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Inter, system-ui, sans-serif; background: var(--bg-page); color: var(--text-primary); }
    a { text-decoration: none; color: inherit; }
    button { cursor: pointer; font-family: inherit; }
    .page-container { max-width: 1440px; margin: 0 auto; padding: 0 32px; }

    /* ── Breadcrumb ── */
    .breadcrumb { padding: 16px 0; display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--text-muted); }
    .breadcrumb a { color: var(--text-muted); }
    .breadcrumb a:hover { color: var(--text-primary); }

    /* ── Product main layout ── */
    .product-layout { display: grid; grid-template-columns: 480px 1fr; gap: 28px; padding-bottom: 40px; align-items: start; }

    /* ── Gallery ── */
    .product-gallery__main {
      height: 420px; background: var(--bg-soft); border-radius: 20px;
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 16px; position: relative; overflow: hidden;
    }
    .product-gallery__placeholder { font-size: 14px; color: var(--text-muted); }
    .product-gallery__badge {
      position: absolute; top: 16px; left: 16px;
      background: #D8B14A; color: #fff; border-radius: 10px;
      padding: 6px 12px; font-size: 13px; font-weight: 700;
    }
    .product-gallery__fav {
      position: absolute; top: 16px; right: 16px;
      width: 36px; height: 36px; border: 1px solid var(--border); border-radius: 50%;
      background: #fff; display: flex; align-items: center; justify-content: center;
      color: var(--text-muted); font-size: 18px;
    }
    .product-gallery__thumbs { display: flex; gap: 12px; }
    .product-gallery__thumb {
      width: 80px; height: 80px; background: var(--bg-soft); border-radius: 12px;
      border: 2px solid transparent; display: flex; align-items: center;
      justify-content: center; font-size: 11px; color: var(--text-muted); cursor: pointer;
      transition: border-color 0.15s;
    }
    .product-gallery__thumb:hover { border-color: var(--brand-main); }
    .product-gallery__thumb.is-active { border-color: var(--brand-main); }

    /* ── Product info card ── */
    .product-info {
      background: #fff; border: 1px solid var(--border); border-radius: 20px;
      padding: 32px; display: flex; flex-direction: column;
    }
    .product-info__brand { font-size: 13px; color: #7A8798; margin-bottom: 8px; }
    .product-info__title {
      font-size: 26px; font-weight: 700; color: var(--text-primary);
      line-height: 1.25; margin-bottom: 14px;
    }
    .product-info__badges { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    .badge {
      height: 28px; padding: 0 14px; border-radius: 14px; background: var(--bg-soft);
      font-size: 13px; color: var(--text-secondary); display: inline-flex; align-items: center;
    }
    .product-info__stock { font-size: 14px; color: var(--text-secondary); display: flex; align-items: center; gap: 7px; margin-bottom: 8px; }
    .stock-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--status-instock); flex-shrink: 0; }
    .product-info__sku { font-size: 13px; color: var(--text-muted); margin-bottom: 4px; }
    .product-info__divider { border: none; border-top: 1px solid var(--border); margin: 20px 0; }

    /* price block */
    .product-info__price-unit { font-size: 34px; font-weight: 700; color: var(--text-primary); line-height: 1; margin-bottom: 6px; }
    .product-info__price-row-sub { display: flex; align-items: baseline; gap: 12px; }
    .product-info__price-old { font-size: 15px; color: #97A3B3; text-decoration: line-through; }
    .product-info__price-pack { font-size: 15px; font-weight: 600; color: var(--text-secondary); }

    /* qty stepper */
    .product-info__qty-row { display: flex; align-items: center; gap: 16px; margin-top: 20px; flex-wrap: wrap; }
    .qty-label { font-size: 14px; color: var(--text-secondary); white-space: nowrap; }
    .qty-stepper { display: flex; align-items: stretch; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
    .qty-stepper__btn {
      width: 44px; height: 44px; border: none; background: var(--bg-soft);
      color: var(--text-primary); font-size: 20px; font-weight: 500;
      display: flex; align-items: center; justify-content: center;
    }
    .qty-stepper__btn:hover { background: var(--border); }
    .qty-stepper__val {
      width: 60px; height: 44px; border: none;
      border-left: 1px solid var(--border); border-right: 1px solid var(--border);
      background: #fff; text-align: center;
      font-size: 16px; font-weight: 600; color: var(--text-primary);
      outline: none;
    }
    .qty-subtotal { font-size: 14px; color: var(--text-secondary); }
    .qty-subtotal strong { color: var(--text-primary); font-size: 18px; font-weight: 700; }
    .product-info__min-order { font-size: 13px; color: var(--text-muted); margin-top: 10px; }

    /* buttons */
    .product-info__btn-row { display: flex; align-items: center; gap: 12px; margin-top: 20px; }
    .btn-order {
      flex: 1; max-width: 280px; height: 52px; border: none; border-radius: 26px;
      background: var(--btn-primary-bg); color: var(--btn-primary-text);
      font-size: 16px; font-weight: 600;
    }
    .btn-order:hover { background: var(--btn-primary-bg-hover); }
    .btn-fav {
      width: 52px; height: 52px; border: 1px solid var(--border); border-radius: 26px;
      background: #fff; display: flex; align-items: center; justify-content: center;
      color: var(--text-muted); font-size: 20px; flex-shrink: 0;
    }
    .btn-fav:hover { color: #C0392B; border-color: #C0392B; }

    /* meta info rows */
    .product-info__meta { margin-top: 20px; display: flex; flex-direction: column; gap: 8px; }
    .product-info__meta-row { display: flex; gap: 8px; font-size: 14px; }
    .product-info__meta-label { color: var(--text-muted); min-width: 130px; flex-shrink: 0; }
    .product-info__meta-value { color: var(--text-primary); font-weight: 500; }

    /* ── Tabs ── */
    .product-tabs { background: #fff; border: 1px solid var(--border); border-radius: 20px; margin-bottom: 32px; overflow: hidden; }
    .product-tabs__nav { display: flex; border-bottom: 1px solid var(--border); }
    .product-tabs__tab {
      padding: 18px 28px; font-size: 15px; font-weight: 500; color: var(--text-secondary);
      border: none; background: none; border-bottom: 3px solid transparent;
      margin-bottom: -1px; cursor: pointer;
    }
    .product-tabs__tab.is-active { color: var(--text-primary); font-weight: 700; border-bottom-color: var(--text-primary); }
    .product-tabs__content { padding: 32px; }
    .product-tabs__desc { font-size: 15px; line-height: 1.8; color: var(--text-secondary); white-space: pre-line; }
    .chars-table { width: 100%; border-collapse: collapse; }
    .chars-table tr:nth-child(odd) td { background: var(--bg-soft); }
    .chars-table td { padding: 11px 16px; font-size: 14px; color: var(--text-primary); border: 1px solid var(--border); }
    .chars-table td:first-child { color: var(--text-secondary); width: 42%; font-weight: 500; }

    /* ── Related products ── */
    .section-title { font-size: 22px; font-weight: 700; color: var(--text-primary); margin-bottom: 20px; }
    .products-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
    .product-card { background: #fff; border: 1px solid var(--border); border-radius: 20px; padding: 20px; display: flex; flex-direction: column; min-height: 420px; transition: box-shadow 0.2s; }
    .product-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .product-card__image-wrap { position: relative; height: 180px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; background: var(--bg-soft); border-radius: 14px; }
    .product-card__img-placeholder { color: var(--text-muted); font-size: 13px; }
    .product-card__fav { position: absolute; top: 10px; right: 10px; width: 32px; height: 32px; border: 1px solid var(--border); border-radius: 50%; background: #fff; display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
    .product-card__brand { font-size: 13px; color: #7A8798; margin-bottom: 6px; }
    .product-card__title { font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; line-height: 1.35; }
    .product-card__volume { font-size: 14px; color: var(--text-secondary); margin-bottom: 10px; }
    .product-card__stock { font-size: 14px; color: var(--text-secondary); margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
    .product-card__min-order { font-size: 14px; color: var(--text-secondary); margin-bottom: 4px; }
    .product-card__price-row { display: flex; flex-direction: column; gap: 4px; margin: 10px 0 14px; }
    .product-card__price-unit { font-size: 20px; font-weight: 700; color: var(--text-primary); }
    .product-card__price-pack { font-size: 15px; font-weight: 600; color: var(--text-secondary); }
    .product-card__button { margin-top: auto; width: 156px; height: 44px; border: none; border-radius: 22px; background: var(--btn-primary-bg); color: var(--btn-primary-text); font-size: 15px; font-weight: 600; }
    .product-card__button:hover { background: var(--btn-primary-bg-hover); }

    /* ── Footer ── */
    .site-footer { margin-top: 48px; padding: 40px 0 0; background: #fff; border-top: 1px solid var(--border); }
    .footer-grid { display: grid; grid-template-columns: 1.2fr 1fr 1fr 1fr; gap: 32px; }
    .footer-logo { height: 48px; mix-blend-mode: multiply; margin-bottom: 12px; }
    .footer-slogan { font-size: 14px; color: var(--text-secondary); margin-bottom: 10px; }
    .footer-phone { font-size: 15px; font-weight: 600; color: var(--text-primary); display: block; margin-bottom: 6px; }
    .footer-address { font-size: 13px; color: var(--text-muted); }
    .footer-title { margin-bottom: 14px; font-size: 16px; font-weight: 700; color: var(--text-primary); }
    .footer-links { display: flex; flex-direction: column; gap: 10px; }
    .footer-links a { color: var(--text-secondary); font-size: 14px; }
    .footer-bottom { margin-top: 32px; padding: 18px 0; border-top: 1px solid var(--border); font-size: 14px; color: var(--text-muted); }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: css}} />
      <div className="page-container" style={{paddingTop: '8px', paddingBottom: '48px'}}>

        {/* Breadcrumb */}
        <div className="breadcrumb">
          <a href="/">Головна</a>
          <span>›</span>
          <a href="/catalog">{product.category}</a>
          <span>›</span>
          <span>{product.name}</span>
        </div>

        {/* Main product section */}
        <div className="product-layout">

          {/* Left — gallery */}
          <div>
            <div className="product-gallery__main">
              <ProductImage brand={product.brand} nl1={product.nl1} nl2={product.nl2}
                            volume={product.volume} bc={product.bc} ac={product.ac}
                            type={product.imgType} variant="front" />
              {product.priceOld && (
                <span className="product-gallery__badge">
                  -{Math.round((1 - product.priceUnit / Number(product.priceOld)) * 100)}%
                </span>
              )}
              <button className="product-gallery__fav">&#9825;</button>
            </div>
            <div className="product-gallery__thumbs">
              {(['front','angle','label','angle'] as const).map((variant, i) => (
                <div key={i} className={"product-gallery__thumb" + (i === 0 ? " is-active" : "")}>
                  <ProductImage brand={product.brand} nl1={product.nl1} nl2={product.nl2}
                                volume={product.volume} bc={product.bc} ac={product.ac}
                                type={product.imgType} variant={variant} />
                </div>
              ))}
            </div>
          </div>

          {/* Right — product info */}
          <div className="product-info">
            <div className="product-info__brand">{product.brand}</div>
            <h1 className="product-info__title">{product.name}</h1>

            <div className="product-info__badges">
              <span className="badge">{product.volume}</span>
              <span className="badge">{product.type}</span>
              <span className="badge">{product.color}</span>
            </div>

            <div className="product-info__stock">
              <span className="stock-dot"></span>
              {product.stock}: {product.stockQty} шт
            </div>
            <div className="product-info__sku">Артикул: {product.sku}</div>

            <hr className="product-info__divider" />

            {/* Price */}
            <div className="product-info__price-unit">{product.priceUnit} грн / шт</div>
            <div className="product-info__price-row-sub">
              {product.priceOld && (
                <span className="product-info__price-old">{product.priceOld} грн</span>
              )}
              <span className="product-info__price-pack">
                {pricePack.toLocaleString('uk-UA')} грн / уп ({product.packQty} шт)
              </span>
            </div>

            <hr className="product-info__divider" />

            {/* Quantity */}
            <div className="product-info__qty-row">
              <span className="qty-label">Кількість:</span>
              <div className="qty-stepper">
                <button className="qty-stepper__btn">−</button>
                <input className="qty-stepper__val" type="number" defaultValue={product.minOrder} min={product.minOrder} readOnly />
                <button className="qty-stepper__btn">+</button>
              </div>
              <div className="qty-subtotal">
                Сума: <strong>{(product.priceUnit * product.minOrder).toLocaleString('uk-UA')} грн</strong>
              </div>
            </div>
            <div className="product-info__min-order">
              Мін. замовлення: {product.minOrder} шт (1 упаковка)
            </div>

            {/* Buttons */}
            <div className="product-info__btn-row">
              <button className="btn-order">Замовити</button>
              <button className="btn-fav">&#9825;</button>
            </div>

            {/* Meta */}
            <hr className="product-info__divider" />
            <div className="product-info__meta">
              <div className="product-info__meta-row">
                <span className="product-info__meta-label">Категорія:</span>
                <span className="product-info__meta-value">
                  <a href="/catalog" style={{color:'var(--brand-main)'}}>{product.category}</a>
                </span>
              </div>
              <div className="product-info__meta-row">
                <span className="product-info__meta-label">Бренд:</span>
                <span className="product-info__meta-value">{product.brand}</span>
              </div>
              <div className="product-info__meta-row">
                <span className="product-info__meta-label">Упаковка:</span>
                <span className="product-info__meta-value">{product.packQty} шт</span>
              </div>
              <div className="product-info__meta-row">
                <span className="product-info__meta-label">Доставка:</span>
                <span className="product-info__meta-value">Нова Пошта, Укрпошта, самовивіз</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs — description / characteristics */}
        <div className="product-tabs">
          <div className="product-tabs__nav">
            <button className="product-tabs__tab is-active">Опис</button>
            <button className="product-tabs__tab">Характеристики</button>
            <button className="product-tabs__tab">Документи</button>
          </div>
          <div className="product-tabs__content">
            {/* Description */}
            <p className="product-tabs__desc">{product.description}</p>

            {/* Characteristics table */}
            <table className="chars-table" style={{marginTop:'28px'}}>
              <tbody>
                {product.characteristics.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Related products */}
        <h2 className="section-title">Схожі товари</h2>
        <div className="products-grid">
          {related.map((p) => (
            <a key={p.id} href={`/product/${p.id}`} style={{display:'contents'}}>
              <div className="product-card">
                <div className="product-card__image-wrap">
                  <ProductImage brand={p.brand} nl1={p.nl1} nl2={p.nl2} volume={p.volume}
                                bc={p.bc} ac={p.ac} type={p.imgType} />
                  <button className="product-card__fav">&#9825;</button>
                </div>
                <div className="product-card__brand">{p.brand}</div>
                <div className="product-card__title">{p.name}</div>
                <div className="product-card__volume">{p.volume}</div>
                <div className="product-card__stock">
                  <span className="stock-dot"></span>
                  {p.stock}
                </div>
                <div className="product-card__min-order">Мін. замовлення: {p.minOrder}</div>
                <div className="product-card__price-row">
                  <span className="product-card__price-unit">{p.priceUnit} / шт</span>
                  <span className="product-card__price-pack">{p.pricePack}</span>
                </div>
                <button className="product-card__button">Замовити</button>
              </div>
            </a>
          ))}
        </div>

      </div>

      {/* Footer — identical to catalog */}
      <footer className="site-footer">
        <div className="page-container">
          <div className="footer-grid">
            <div>
              <img src="/fixhub-logo2.png" alt="FIXHUB" className="footer-logo" />
              <p className="footer-slogan">Будівельна хімія оптом</p>
              <a href="tel:+380671234567" className="footer-phone">+38 (067) 123-45-67</a>
              <p className="footer-address">Україна, м. Харків</p>
            </div>
            <div>
              <p className="footer-title">Каталог</p>
              <div className="footer-links">
                <a href="#">Герметики</a>
                <a href="#">Монтажні піни</a>
                <a href="#">Клеї</a>
                <a href="#">Рідкі цвяхи</a>
                <a href="#">Ґрунтовки</a>
                <a href="#">Стрічки</a>
              </div>
            </div>
            <div>
              <p className="footer-title">Інформація</p>
              <div className="footer-links">
                <a href="#">Опт</a>
                <a href="#">Доставка</a>
                <a href="#">Контакти</a>
                <a href="#">Про компанію</a>
                <a href="#">Політика конфіденційності</a>
              </div>
            </div>
            <div>
              <p className="footer-title">Зв&apos;язок</p>
              <div className="footer-links">
                <a href="tel:+380671234567">+38 (067) 123-45-67</a>
                <a href="#">Telegram</a>
                <a href="#">Viber</a>
                <a href="#">Instagram</a>
              </div>
            </div>
          </div>
          <div className="footer-bottom">© FixHub 2026. Усі права захищені.</div>
        </div>
      </footer>
    </>
  );
}
