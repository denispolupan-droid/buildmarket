import Image from 'next/image';
import { Mail, Phone, MapPin, Send, Camera, Clock4 } from 'lucide-react';

const socials = [
  { Icon: Send,   label: 'Telegram',  href: '#' },
  { Icon: Phone,  label: 'Viber',     href: '#' },
  { Icon: Camera, label: 'Instagram', href: '#' },
  { Icon: Mail,   label: 'Email',     href: '#' },
];

export default function Footer() {
  return (
    <footer style={{ background: '#0F172A' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '48px 32px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1.2fr', gap: '48px', paddingBottom: '40px' }}>

          {/* Brand */}
          <div>
            <Image
              src="/fixline-logo.png" alt="FIXLINE"
              width={136} height={34}
              style={{ width: 'auto', height: '34px', display: 'block', marginBottom: '16px' }}
            />
            <p style={{ fontSize: '14px', color: '#64748B', lineHeight: '1.7', maxWidth: '300px', marginBottom: '20px' }}>
              Професійний B2B постачальник будівельної хімії: герметиків, клеїв, монтажних пін та супутніх матеріалів.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              {socials.map(({ Icon, label, href }) => (
                <a key={label} href={href} title={label} style={{
                  width: '36px', height: '36px', borderRadius: '8px',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B',
                  transition: 'background 0.15s, color 0.15s',
                }}>
                  <Icon size={15} strokeWidth={2} />
                </a>
              ))}
            </div>
          </div>

          {/* Service */}
          <div>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#F1F5F9', marginBottom: '18px' }}>
              Обслуговування
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {["Зв'яжіться з нами", 'Умови доставки', 'Політика повернення', 'Часті питання', 'Про компанію'].map(l => (
                <a key={l} href="#" style={{ fontSize: '14px', color: '#64748B' }}>{l}</a>
              ))}
            </div>
          </div>

          {/* Contacts */}
          <div>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#F1F5F9', marginBottom: '18px' }}>Контакти</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <a href="mailto:sales@fixline.com.ua" style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                fontSize: '14px', color: '#64748B', textDecoration: 'none',
              }}>
                <Mail size={15} strokeWidth={2} color="#475569" />
                sales@fixline.com.ua
              </a>
              <a href="tel:+380671234567" style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                fontSize: '14px', color: '#64748B', textDecoration: 'none',
              }}>
                <Phone size={15} strokeWidth={2} color="#475569" />
                +38 (067) 123-45-67
              </a>
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#475569' }}>
                <Clock4 size={15} strokeWidth={2} />
                Пн–Пт 8:00–18:00
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#475569' }}>
                <MapPin size={15} strokeWidth={2} />
                Київ, Україна
              </span>
            </div>
          </div>

        </div>

        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.07)',
          padding: '18px 0', textAlign: 'center',
        }}>
          <span style={{ fontSize: '13px', color: '#334155' }}>© 2026 FIXLINE. Всі права захищені.</span>
        </div>
      </div>
    </footer>
  );
}
