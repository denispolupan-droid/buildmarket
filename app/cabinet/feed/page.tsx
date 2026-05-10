import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { Rss, Copy } from 'lucide-react';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function FeedPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: customer } = await serviceClient
    .from('customers').select('id, partner_code').eq('auth_user_id', user!.id).single();

  const token   = customer?.partner_code ?? customer?.id ?? '';
  const feedUrl = `https://fixline.com.ua/api/dropship/feed?token=${token}`;

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '760px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Прайс-фід</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          XML/YML фід з вашими особистими цінами для підключення до маркетплейсів
        </p>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Rss size={18} color="#4880B8" />
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Ваше особисте посилання на фід</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Оновлюється кожні 2 години</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-primary)', wordBreak: 'break-all', marginBottom: '12px' }}>
          {feedUrl}
        </div>

        <p style={{ fontSize: '12px', color: '#B45309', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '8px', padding: '10px 14px', margin: '0 0 16px' }}>
          ⚠️ Не передавайте це посилання третім особам — воно містить ваш особистий токен і показує ваші ціни.
        </p>

        <div style={{ display: 'flex', gap: '10px' }}>
          {[
            { format: 'yml', label: 'YML (для Prom.ua)' },
            { format: 'xml', label: 'XML (для OpenCart)' },
          ].map(({ format, label }) => (
            <a key={format} href={`${feedUrl}&format=${format}`} target="_blank" rel="noopener" style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              height: '36px', padding: '0 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-primary)', textDecoration: 'none',
            }}>
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' }}>
          Як підключити до магазину
        </h2>
        {[
          { title: 'Prom.ua', steps: ['Магазин → Товари → Імпорт → XML/YML', 'Вставте URL фіду', 'Оберіть автооновлення: кожні 4 години'] },
          { title: 'Horoshop',  steps: ['Налаштування → Імпорт → YML', 'Вставте URL фіду', 'Увімкніть автосинхронізацію'] },
          { title: 'OpenCart', steps: ['Модуль XML Feed Import', 'Вставте URL з параметром ?format=xml', 'Налаштуйте розклад оновлення'] },
        ].map(({ title, steps }) => (
          <div key={title} style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>{title}</div>
            <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {steps.map(step => (
                <li key={step} style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{step}</li>
              ))}
            </ol>
          </div>
        ))}
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Потрібна допомога з підключенням? Напишіть вашому менеджеру.
        </p>
      </div>
    </div>
  );
}
