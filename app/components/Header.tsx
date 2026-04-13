import { Search, Send, Phone, ShoppingCart } from 'lucide-react';

export default function Header() {
  return (
    <>
      <header style={{
        height: '88px',
        background: '#F6F8FB',
        borderBottom: '1px solid #D9E0E8',
        overflow: 'visible',
        position: 'relative',
        zIndex: 10,
      }}>
<div style={{maxWidth:'1440px',margin:'0 auto',padding:'0 32px 0 0',height:'100%',display:'flex',alignItems:'center',justifyContent:'space-between'}}>          <a href="/" style={{display:'flex',alignItems:'flex-end',height:'70px',overflow:'visible'}}>
            <img
              src="/fixhub-logo2.png"
              alt="FIXHUB"
              style={{height:'320%',width:'auto',display:'block',marginBottom:'-75px'}}
            />
          </a>
          <nav style={{display:'flex',alignItems:'center',gap:'36px'}}>
            <a href="/" style={{fontSize:'16px',fontWeight:500,color:'#5E6E84',textDecoration:'none'}}>Головна</a>
            <a href="/catalog" style={{fontSize:'16px',fontWeight:500,color:'#5E6E84',textDecoration:'none'}}>Каталог</a>
            <a href="#" style={{fontSize:'16px',fontWeight:500,color:'#5E6E84',textDecoration:'none'}}>Опт</a>
            <a href="#" style={{fontSize:'16px',fontWeight:500,color:'#5E6E84',textDecoration:'none'}}>Доставка</a>
            <a href="#" style={{fontSize:'16px',fontWeight:500,color:'#5E6E84',textDecoration:'none'}}>Контакти</a>
          </nav>
          <div style={{display:'flex',alignItems:'center',gap:'16px'}}>
            <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'8px'}}>
              <a href="tel:+380671234567" style={{fontSize:'16px',fontWeight:600,color:'#22324A',textDecoration:'none',display:'flex',alignItems:'center',gap:'6px'}}>
                <Phone size={16} strokeWidth={2} />
                +38 (067) 123-45-67
              </a>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <a href="#" style={{width:'32px',height:'32px',borderRadius:'10px',background:'#5B8FC9',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#fff'}}>
                  <Send size={15} strokeWidth={2} />
                </a>
                <a href="#" style={{width:'32px',height:'32px',borderRadius:'10px',background:'#7D6BAE',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#fff'}}>
                  <Phone size={15} strokeWidth={2} />
                </a>
                <a href="#" style={{width:'32px',height:'32px',borderRadius:'10px',background:'#9A7A8B',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:'13px',fontWeight:700}}>
                  in
                </a>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'4px'}}>
              <button style={{position:'relative',width:'52px',height:'52px',border:'1px solid #D9E0E8',borderRadius:'14px',background:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#5E6E84',cursor:'pointer'}}>
                <ShoppingCart size={28} strokeWidth={1.5} />
                <span style={{position:'absolute',top:'-4px',right:'-4px',minWidth:'18px',height:'18px',padding:'0 5px',borderRadius:'999px',background:'#B8962E',color:'#fff',fontSize:'11px',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>0</span>
              </button>
              <a href="/login" style={{fontSize:'11px',color:'#5E6E84',textDecoration:'none',whiteSpace:'nowrap'}}>Вхід в кабінет</a>
            </div>
          </div>
        </div>
      </header>

      <div style={{padding:'12px 0',background:'#F6F8FB',borderBottom:'1px solid #D9E0E8'}}>
        <div style={{maxWidth:'1440px',margin:'0 auto',padding:'0 32px',display:'flex',alignItems:'center',gap:'12px',flexWrap:'wrap'}}>
          <button style={{height:'44px',padding:'0 24px',borderRadius:'24px',border:'none',background:'#2A4E76',color:'#fff',fontSize:'15px',fontWeight:600,cursor:'pointer'}}>Всі товари</button>
          <button style={{height:'44px',padding:'0 18px',borderRadius:'24px',border:'1px solid #D9E0E8',background:'#fff',color:'#22324A',fontSize:'15px',fontWeight:500,cursor:'pointer'}}>Категорії</button>
          <div style={{display:'flex',alignItems:'center',gap:'20px'}}>
            <a href="#" style={{color:'#5E6E84',fontSize:'16px',fontWeight:500,textDecoration:'none'}}>Акції</a>
            <a href="#" style={{color:'#5E6E84',fontSize:'16px',fontWeight:500,textDecoration:'none'}}>Хіти</a>
            <a href="#" style={{color:'#5E6E84',fontSize:'16px',fontWeight:500,textDecoration:'none'}}>Новинки</a>
          </div>
          <div style={{marginLeft:'auto',position:'relative',width:'280px'}}>
            <span style={{position:'absolute',top:'50%',left:'14px',transform:'translateY(-50%)',color:'#8895A7',display:'flex',alignItems:'center'}}>
              <Search size={16} strokeWidth={1.5} />
            </span>
            <input type="text" placeholder="Що шукаєте?" style={{width:'100%',height:'44px',padding:'0 16px 0 42px',borderRadius:'22px',border:'1px solid #D9E0E8',background:'#fff',color:'#22324A',fontSize:'15px',outline:'none'}} />
          </div>
          <button style={{height:'44px',padding:'0 24px',borderRadius:'24px',border:'none',background:'#D9E3EE',color:'#22324A',fontSize:'15px',fontWeight:600,cursor:'pointer'}}>Отримати прайс</button>
        </div>
      </div>
    </>
  );
}