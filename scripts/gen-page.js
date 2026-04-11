const fs = require('fs');

const code = `
import { Search, Send, Phone, Instagram, ShoppingCart, Heart } from 'lucide-react';

export default function Home() {
  const categories = [
    {name:"Герметики",count:24},
    {name:"Монтажні піни",count:18},
    {name:"Рідкі цвяхи",count:12},
    {name:"Клеї",count:10},
    {name:"Ґрунтовки",count:10},
    {name:"Стрічки",count:6},
  ];
  const brands = ["MakHUB","KUDO","Tytan","Sila"];
  const types = ["Акриловий","Силіконовий","Поліуретановий","Монтажний"];
  const products = [
    {brand:"FIXHUB",name:"ТЕРМЕНА 65 ПРО",volume:"650 мл",stock:"Є з наявності",minOrder:"12 шт",priceUnit:"279 грн",pricePack:"3 348 грн / уп"},
    {brand:"FIXHUB",name:"Акриловий герметик",volume:"260 мл",stock:"Є з наявності: 12 шт",minOrder:"12 шт",priceUnit:"119 грн",pricePack:"1 428 грн / уп"},
    {brand:"FIXHUB",name:"ЖИДКІ ДВАХИ EXPERT",volume:"370 мл",stock:"Є з наявності: 24 шт",minOrder:"6 шт",priceUnit:"139 грн",pricePack:"834 грн / уп"},
    {brand:"FIXHUB",name:"ТЕРМЕНА 1600 PRO",volume:"1000 мл",stock:"Є з наявності: 12 шт",minOrder:"12 шт",priceUnit:"399 грн",priceOld:"450 грн",pricePack:"4 788 грн / уп"},
    {brand:"KUDO",name:"Силкон Санітарний",volume:"290 мл",stock:"Є з наявності: 12 шт",minOrder:"12 шт",priceUnit:"109 грн",pricePack:"1 308 грн / уп"},
    {brand:"Tytan",name:"Монтажна піна ЗИМОВА",volume:"750 мл",stock:"Є з наявності: 12 шт",minOrder:"12 шт",priceUnit:"319 грн",pricePack:"3 828 грн / уп"},
  ];

  const css = \`
    :root {
      --bg-page: #F6F8FB;
      --bg-card: #FFFFFF;
      --bg-soft: #EEF2F6;
      --border: #D9E0E8;
      --text-primary: #22324A;
      --text-secondary: #5E6E84;
      --text-muted: #8895A7;
      --brand-main: #4F637A;
      --brand-dark: #2A3748;
      --brand-accent: #B8962E;
      --btn-primary-bg: #AFC4DA;
      --btn-primary-bg-hover: #9EB6CF;
      --btn-primary-text: #22324A;
      --status-instock: #6BAE57;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Inter, system-ui, sans-serif; font-size: 16px; line-height: 1.5; color: var(--text-primary); background: var(--bg-page); }
    a { text-decoration: none; color: inherit; }
    button { cursor: pointer; font-family: inherit; }
    .page-container { max-width: 1440px; width: 100%; margin: 0 auto; padding: 0 32px; }

    .site-header { height: 100px; background: var(--bg-page); border-bottom: 1px solid var(--border); }
    .site-header__inner { height: 100%; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
    .logo { display: flex; align-items: center; height: 80px; }
    .logo img { height: 100%; width: auto; display: block; mix-blend-mode: multiply; }
    .header-nav { display: flex; align-items: center; gap: 36px; }
    .header-nav a { font-size: 16px; font-weight: 500; color: var(--text-secondary); }
    .header-nav a:hover { color: var(--text-primary); }
    .header-actions { display: flex; align-items: center; gap: 16px; }
    .header-contact { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .header-phone { font-size: 16px; font-weight: 600; color: var(--text-primary); white-space: nowrap; display: flex; align-items: center; gap: 6px; }
    .header-socials { display: flex; align-items: center; gap: 8px; }
    .social-icon { width: 32px; height: 32px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; color: #fff; }
    .social-icon--tg { background: #5B8FC9; }
    .social-icon--viber { background: #7D6BAE; }
    .social-icon--insta { background: #9A7A8B; }
    .cart-button { position: relative; width: 40px; height: 40px; border: 1px solid var(--border); border-radius: 12px; background: #fff; display: inline-flex; align-items: center; justify-content: center; color: var(--text-secondary); }
    .cart-button:hover { border-color: var(--brand-main); color: var(--brand-main); }
    .cart-badge { position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: var(--brand-accent); color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; }

    .subheader { padding: 12px 0; background: var(--bg-page); border-bottom: 1px solid var(--border); }
    .subheader__inner { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .btn-all { height: 44px; padding: 0 24px; border-radius: 24px; border: none; background: #2A4E76; color: #fff; font-size: 15px; font-weight: 600; }
    .btn-cat { height: 44px; padding: 0 18px; border-radius: 24px; border: 1px solid var(--border); background: #fff; color: var(--text-primary); font-size: 15px; font-weight: 500; }
    .subheader-tabs { display: flex; align-items: center; gap: 20px; }
    .subheader-tabs a { color: var(--text-secondary); font-size: 16px; font-weight: 500; }
    .subheader-tabs a:hover { color: var(--text-primary); }
    .catalog-search { margin-left: auto; position: relative; width: 280px; }
    .catalog-search input { width: 100%; height: 44px; padding: 0 16px 0 42px; border-radius: 22px; border: 1px solid var(--border); background: #fff; color: var(--text-primary); font-size: 15px; outline: none; }
    .search-icon { position: absolute; top: 50%; left: 14px; transform: translateY(-50%); color: var(--text-muted); display: flex; align-items: center; }
    .btn-price { height: 44px; padding: 0 24px; border-radius: 24px; border: none; background: #D9E3EE; color: var(--text-primary); font-size: 15px; font-weight: 600; }
    .btn-price:hover { background: #ccd7e8; }

    .catalog-layout { display: grid; grid-template-columns: 280px 1fr; gap: 24px; align-items: start; padding-top: 24px; padding-bottom: 48px; }
    .sidebar-stack { display: flex; flex-direction: column; gap: 16px; }
    .sidebar-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 20px; padding: 24px; }
    .sidebar-card__title { margin: 0 0 20px; font-size: 18px; font-weight: 700; color: var(--text-primary); }
    .category-list { display: flex; flex-direction: column; gap: 4px; }
    .category-list__item { min-height: 42px; padding: 8px 10px; border-radius: 10px; display: flex; align-items: center; justify-content: space-between; color: var(--text-primary); cursor: pointer; }
    .category-list__item:hover { background: var(--bg-page); }
    .category-list__label { display: flex; align-items: center; gap: 10px; font-size: 15px; }
    .cat-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--brand-main); flex-shrink: 0; }
    .category-list__count { color: #7A8798; font-size: 13px; }
    .sidebar-show-all { display: inline-block; margin-top: 12px; color: var(--brand-main); font-weight: 500; font-size: 14px; }
    .filter-list { display: flex; flex-direction: column; gap: 12px; }
    .filter-list label { display: flex; align-items: center; gap: 10px; color: var(--text-primary); font-size: 15px; cursor: pointer; }
    .filter-list input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--brand-main); cursor: pointer; }

    .catalog-top-tabs { height: 72px; background: #fff; border: 1px solid var(--border); border-radius: 20px; padding: 0 24px; display: flex; align-items: center; gap: 32px; margin-bottom: 20px; }
    .catalog-top-tabs a { font-size: 16px; font-weight: 500; color: var(--text-secondary); position: relative; padding-bottom: 4px; }
    .catalog-top-tabs a:hover { color: var(--text-primary); }
    .catalog-top-tabs a.is-active { color: var(--text-primary); font-weight: 700; }
    .catalog-top-tabs a.is-active::after { content: ""; position: absolute; left: 0; bottom: -22px; width: 100%; height: 2px; background: var(--text-primary); border-radius: 2px; }

    .catalog-banner { min-height: 280px; border-radius: 24px; overflow: hidden; background: linear-gradient(90deg, #DCE8F3 0%, #F2E5C9 100%); display: grid; grid-template-columns: 1.1fr 0.9fr; align-items: center; padding: 40px; margin-bottom: 24px; }
    .catalog-banner__title { margin: 0 0 12px; font-size: 40px; line-height: 1.1; font-weight: 700; color: var(--text-primary); }
    .catalog-banner__text { margin: 0 0 24px; font-size: 18px; color: var(--text-secondary); }
    .catalog-banner__btn { height: 48px; padding: 0 28px; border-radius: 24px; border: none; background: #6F92BC; color: #fff; font-size: 15px; font-weight: 600; }
    .catalog-banner__products { position: relative; display: flex; justify-content: flex-end; align-items: flex-end; gap: 12px; }
    .banner-product-img { background: rgba(255,255,255,0.5); border-radius: 16px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 12px; }
    .catalog-banner__discount { position: absolute; left: 0; bottom: 0; background: #D8B14A; color: #fff; border-radius: 14px; padding: 10px 16px; font-weight: 700; font-size: 14px; line-height: 1.4; }

    .products-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
    .product-card { background: #fff; border: 1px solid var(--border); border-radius: 20px; padding: 20px; display: flex; flex-direction: column; min-height: 460px; }
    .product-card__image-wrap { position: relative; height: 200px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; background: var(--bg-soft); border-radius: 14px; }
    .product-card__img-placeholder { color: var(--text-muted); font-size: 13px; }
    .product-card__fav { position: absolute; top: 10px; right: 10px; width: 32px; height: 32px; border: 1px solid var(--border); border-radius: 50%; background: #fff; display: flex; align-items: center; justify-content: center; color: var(--text-muted); cursor: pointer; }
    .product-card__fav:hover { color: #e05; border-color: #e05; }
    .product-card__brand { font-size: 13px; color: #7A8798; margin-bottom: 6px; }
    .product-card__title { font-size: 16px; line-height: 1.35; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }
    .product-card__volume { font-size: 14px; color: var(--text-secondary); margin-bottom: 10px; }
    .product-card__stock { font-size: 14px; color: var(--text-secondary); margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
    .stock-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--status-instock); flex-shrink: 0; }
    .product-card__min-order { font-size: 14px; color: var(--text-secondary); margin-bottom: 4px; }
    .product-card__price-row { display: flex; flex-direction: column; gap: 4px; margin: 10px 0 14px; }
    .product-card__price-unit { font-size: 20px; font-weight: 700; color: var(--text-primary); }
    .product-card__price-pack { font-size: 15px; font-weight: 600; color: var(--text-secondary); }
    .product-card__price-old { font-size: 13px; color: #97A3B3; text-decoration: line-through; }
    .product-card__button { margin-top: auto; width: 156px; height: 44px; border: none; border-radius: 22px; background: var(--btn-primary-bg); color: var(--btn-primary-text); font-size: 15px; font-weight: 600; }
    .product-card__button:hover { background: var(--btn-primary-bg-hover); }

    .site-footer { margin-top: 48px; padding: 40px 0 0; background: #FFFFFF; border-top: 1px solid var(--border); }
    .footer-grid { display: grid; grid-template-columns: 1.2fr 1fr 1fr 1fr; gap: 32px; }
    .footer-logo { height: 56px; mix-blend-mode: multiply; margin-bottom: 12px; }
    .footer-slogan { font-size: 14px; color: var(--text-secondary); margin-bottom: 10px; }
    .footer-phone { font-size: 15px; font-weight: 600; color: var(--text-primary); display: block; margin-bottom: 6px; }
    .footer-address { font-size: 13px; color: var(--text-muted); }
    .footer-title { margin-bottom: 14px; font-size: 16px; font-weight: 700; color: var(--text-primary); }
    .footer-links { display: flex; flex-direction: column; gap: 10px; }
    .footer-links a { color: var(--text-secondary); font-size: 14px; }
    .footer-links a:hover { color: var(--text-primary); }
    .footer-social { display: flex; gap: 10px; margin-top: 12px; }
    .footer-bottom { margin-top: 32px; padding: 18px 0; border-top: 1px solid var(--border); font-size: 14px; color: var(--text-muted); }

    @media (max-width: 1199px) {
      .catalog-layout { grid-template-columns: 1fr; }
      .products-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .footer-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 767px) {
      .products-grid { grid-template-columns: 1fr; }
      .catalog-search { width: 100%; }
      .footer-grid { grid-template-columns: 1fr; }
    }
  \`;

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: css}} />

      <header className="site-header">
        <div className="page-container">
          <div className="site-header__inner">
            <div className="logo">
              <img src="/fixhub-logo2.png" alt="FIXHUB" />
            </div>
            <nav className="header-nav">
              <a href="#">Каталог</a>
              <a href="#">Опт</a>
              <a href="#">Доставка</a>
              <a href="#">Контакти</a>
            </nav>
            <div className="header-actions">
              <div className="header-contact">
                <a href="tel:+380671234567" className="header-phone">
                  <Phone size={16} strokeWidth={2} />
                  +38 (067) 123-45-67
                </a>
                <div className="header-socials">
                  <a href="#" className="social-icon social-icon--tg" title="Telegram">
                    <Send size={16} strokeWidth={2} />
                  </a>
                  <a href="#" className="social-icon social-icon--viber" title="Viber">
                    <Phone size={16} strokeWidth={2} />
                  </a>
                  <a href="#" className="social-icon social-icon--insta" title="Instagram">
                    <Instagram size={16} strokeWidth={2} />
                  </a>
                </div>
              </div>
              <button className="cart-button">
                <ShoppingCart size={20} strokeWidth={1.5} />
                <span className="cart-badge">0</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="subheader">
        <div className="page-container">
          <div className="subheader__inner">
            <button className="btn-all">Всі товари</button>
            <button className="btn-cat">Категорії &#8964;</button>
            <div className="subheader-tabs">
              <a href="#">Акції</a>
              <a href="#">Хіти</a>
              <a href="#">Новинки</a>
            </div>
            <div className="catalog-search">
              <span className="search-icon">
                <Search size={16} strokeWidth={1.5} />
              </span>
              <input type="text" placeholder="Що шукаєте?" />
            </div>
            <button className="btn-price">Отримати прайс</button>
          </div>
        </div>
      </div>

      <div className="page-container">
        <div className="catalog-layout">
          <aside>
            <div className="sidebar-stack">
              <div className="sidebar-card">
                <h3 className="sidebar-card__title">Категорії</h3>
                <div className="category-list">
                  {categories.map((cat) => (
                    <div key={cat.name} className="category-list__item">
                      <div className="category-list__label">
                        <div className="cat-dot"></div>
                        <span>{cat.name}</span>
                      </div>
                      <span className="category-list__count">({cat.count})</span>
                    </div>
                  ))}
                </div>
                <a href="#" className="sidebar-show-all">Показати всі</a>
              </div>
              <div className="sidebar-card">
                <div className="filter-list">
                  {brands.map((b) => (
                    <label key={b}>
                      <input type="checkbox" />
                      <span>{b}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="sidebar-card">
                <div className="filter-list">
                  {types.map((t) => (
                    <label key={t}>
                      <input type="checkbox" />
                      <span>{t}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          <div>
            <div className="catalog-top-tabs">
              <a href="#">Всі товари</a>
              <a href="#">Категорії</a>
              <a href="#" className="is-active">Акції</a>
              <a href="#">Хіти</a>
              <a href="#">Новинки</a>
            </div>

            <div className="catalog-banner">
              <div>
                <h2 className="catalog-banner__title">Акції та<br />новинки!</h2>
                <p className="catalog-banner__text">Спеціальні пропозиції, знижки,<br />новий асортимент</p>
                <button className="catalog-banner__btn">Дізнатись більше</button>
              </div>
              <div className="catalog-banner__products">
                <div className="banner-product-img" style={{width:'100px',height:'140px'}}>фото</div>
                <div className="banner-product-img" style={{width:'90px',height:'120px'}}>фото</div>
                <div className="banner-product-img" style={{width:'90px',height:'120px'}}>фото</div>
                <div className="catalog-banner__discount">-20%<br />на термепакі!</div>
              </div>
            </div>

            <div className="products-grid">
              {products.map((p) => (
                <div key={p.name} className="product-card">
                  <div className="product-card__image-wrap">
                    <span className="product-card__img-placeholder">фото товару</span>
                    <button className="product-card__fav">
                      <Heart size={16} strokeWidth={1.5} />
                    </button>
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
                    {p.priceOld && <span className="product-card__price-old">{p.priceOld}</span>}
                    <span className="product-card__price-pack">{p.pricePack}</span>
                  </div>
                  <button className="product-card__button">Замовити</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <footer className="site-footer">
        <div className="page-container">
          <div className="footer-grid">
            <div>
              <img src="/fixhub-logo2.png" alt="FIXHUB" className="footer-logo" />
              <p className="footer-slogan">Будівельна хімія оптом</p>
              <a href="tel:+380671234567" className="footer-phone">+38 (067) 123-45-67</a>
              <p className="footer-address">Україна, м. Харків</p>
              <div className="footer-social">
                <a href="#" className="social-icon social-icon--tg"><Send size={15} strokeWidth={2} /></a>
                <a href="#" className="social-icon social-icon--viber"><Phone size={15} strokeWidth={2} /></a>
                <a href="#" className="social-icon social-icon--insta"><Instagram size={15} strokeWidth={2} /></a>
              </div>
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
              <p className="footer-title">Зв'язок</p>
              <div className="footer-links">
                <a href="tel:+380671234567">+38 (067) 123-45-67</a>
                <a href="#">Telegram</a>
                <a href="#">Viber</a>
                <a href="#">Instagram</a>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            © FixHub 2026. Усі права захищені.
          </div>
        </div>
      </footer>
    </>
  );
}`;

fs.writeFileSync('app/page.tsx', code, 'utf8');
console.log('Done!');