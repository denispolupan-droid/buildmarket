const fs = require('fs');

const code = `
export default function Home() {
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

    .catalog-banner { min-height: 280px; border-radius: 24px; background: linear-gradient(90deg, #DCE8F3 0%, #F2E5C9 100%); display: grid; grid-template-columns: 1.1fr 0.9fr; align-items: center; padding: 40px; margin-bottom: 24px; }
    .catalog-banner__title { font-size: 40px; font-weight: 700; color: var(--text-primary); margin-bottom: 12px; line-height: 1.1; }
    .catalog-banner__text { font-size: 18px; color: var(--text-secondary); margin-bottom: 24px; }
    .catalog-banner__btn { height: 48px; padding: 0 28px; border-radius: 24px; border: none; background: #6F92BC; color: #fff; font-size: 15px; font-weight: 600; }
    .catalog-banner__products { display: flex; justify-content: flex-end; align-items: flex-end; gap: 12px; position: relative; }
    .banner-img { background: rgba(255,255,255,0.5); border-radius: 16px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 12px; }
    .catalog-banner__discount { position: absolute; left: 0; bottom: 0; background: #D8B14A; color: #fff; border-radius: 14px; padding: 10px 16px; font-weight: 700; font-size: 14px; line-height: 1.4; }

    .catalog-top-tabs { height: 72px; background: #fff; border: 1px solid var(--border); border-radius: 20px; padding: 0 24px; display: flex; align-items: center; gap: 32px; margin-bottom: 20px; }
    .catalog-top-tabs a { font-size: 16px; font-weight: 500; color: var(--text-secondary); position: relative; padding-bottom: 4px; }
    .catalog-top-tabs a.is-active { color: var(--text-primary); font-weight: 700; }
    .catalog-top-tabs a.is-active::after { content: ""; position: absolute; left: 0; bottom: -22px; width: 100%; height: 2px; background: var(--text-primary); border-radius: 2px; }

    .products-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
    .product-card { background: #fff; border: 1px solid var(--border); border-radius: 20px; padding: 20px; display: flex; flex-direction: column; min-height: 460px; }
    .product-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .product-card__image-wrap { position: relative; height: 200px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; background: var(--bg-soft); border-radius: 14px; }
    .product-card__img-placeholder { color: var(--text-muted); font-size: 13px; }
    .product-card__fav { position: absolute; top: 10px; right: 10px; width: 32px; height: 32px; border: 1px solid var(--border); border-radius: 50%; background: #fff; display: flex; align-items: center; justify-content: center; color: var(--text-muted); cursor: pointer; }
    .product-card__brand { font-size: 13px; color: #7A8798; margin-bottom: 6px; }
    .product-card__title { font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; line-height: 1.35; }
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
  \`;

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: css}} />
      <div className="page-container" style={{paddingTop:'24px',paddingBottom:'48px'}}>

        <div className="catalog-banner">
          <div>
            <h1 className="catalog-banner__title">Акції та<br />новинки!</h1>
            <p className="catalog-banner__text">Спеціальні пропозиції, знижки,<br />новий асортимент</p>
            <button className="catalog-banner__btn">Дізнатись більше</button>
          </div>
          <div className="catalog-banner__products">
            <div className="banner-img" style={{width:'100px',height:'140px'}}>фото</div>
            <div className="banner-img" style={{width:'90px',height:'120px'}}>фото</div>
            <div className="banner-img" style={{width:'90px',height:'120px'}}>фото</div>
            <div className="catalog-banner__discount">-20%<br />на термепакі!</div>
          </div>
        </div>

        <div className="catalog-top-tabs">
          <a href="#" className="is-active">Всі товари</a>
          <a href="#">Акції</a>
          <a href="#">Хіти</a>
          <a href="#">Новинки</a>
        </div>

        <div className="products-grid">
          {products.map((p) => (
            <div key={p.name} className="product-card">
              <div className="product-card__image-wrap">
                <span className="product-card__img-placeholder">фото товару</span>
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
                {p.priceOld && <span className="product-card__price-old">{p.priceOld}</span>}
                <span className="product-card__price-pack">{p.pricePack}</span>
              </div>
              <button className="product-card__button">Замовити</button>
            </div>
          ))}
        </div>

      </div>

      <footer className="site-footer">
        <div className="page-container">
          <div className="footer-grid">
            <div>
              <img src="/fixline-logo.png" alt="FIXHUB" className="footer-logo" />
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
              <p className="footer-title">Зв'язок</p>
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
}`;

fs.writeFileSync('app/page.tsx', code, 'utf8');
console.log('Done!');