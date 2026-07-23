import { Resend } from 'resend';
import { createServiceClient } from './supabase';

// Єдина логіка вибору відправника для листів постачальникам (замовлення покупця
// та закупівлі). Список дозволених адрес — основний (orders_from_*) + додаткові
// (extra_senders). Вибір із фронта валідуємо по цьому списку (не даємо довільний
// FROM). Ключ Resend — по домену відправника (resend_keys), бо на безкоштовному
// Resend лише 1 домен; інші домени обслуговує окремий акаунт зі своїм ключем.

export type ResolvedSender = {
  fromEmail: string;
  fromName:  string;
  from:      string;              // "Name <email>"
  resend:    Resend;              // клієнт із правильним ключем для домену
};

export async function resolveSender(
  db: ReturnType<typeof createServiceClient>,
  senderEmail?: string,
): Promise<ResolvedSender> {
  const { data: rows } = await db.from('app_settings').select('key, value')
    .in('key', ['orders_from_email', 'orders_from_name', 'extra_senders', 'resend_keys']);
  const cfg: Record<string, string> = {};
  (rows ?? []).forEach(r => { cfg[r.key] = r.value; });

  const primary = { email: cfg.orders_from_email || 'orders@fixline.com.ua', name: cfg.orders_from_name || 'FIXLINE' };
  let extra: { email: string; name: string }[] = [];
  try { const p = JSON.parse(cfg.extra_senders || '[]'); if (Array.isArray(p)) extra = p; } catch { /* ignore */ }
  const allowed = [primary, ...extra].filter(s => s?.email?.includes('@'));

  const chosen = (senderEmail && allowed.find(s => s.email.toLowerCase() === senderEmail.toLowerCase())) || primary;
  const fromEmail = chosen.email;
  const fromName  = chosen.name || primary.name;

  const domain = fromEmail.split('@')[1]?.toLowerCase() ?? '';
  let keys: Record<string, string> = {};
  try { const p = JSON.parse(cfg.resend_keys || '{}'); if (p && typeof p === 'object') keys = p; } catch { /* ignore */ }
  const resend = new Resend(keys[domain] || process.env.RESEND_API_KEY);

  return { fromEmail, fromName, from: `${fromName} <${fromEmail}>`, resend };
}
