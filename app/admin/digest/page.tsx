import { requireStaffPage } from '../../../lib/auth-guard';
import { createServiceClient } from '../../../lib/supabase';
import DigestClient from './DigestClient';

export const dynamic = 'force-dynamic';

// Ранковий дайджест по операціях: попередній перегляд, ручна відправка в
// Telegram, вимикач крона й історія запусків (ai_agent_runs, agent=ops_digest).
export default async function DigestPage() {
  await requireStaffPage('admin');
  const db = createServiceClient();
  const [{ data: setting }, { data: runs }] = await Promise.all([
    db.from('app_settings').select('value').eq('key', 'ops_digest').maybeSingle(),
    db.from('ai_agent_runs').select('id, created_at, created_by, cost_usd, error, output')
      .eq('agent', 'ops_digest').order('created_at', { ascending: false }).limit(14),
  ]);
  const enabled = (setting?.value ?? '').trim().toLowerCase() !== 'off';
  const history = (runs ?? []).map(r => ({
    id: r.id as string,
    at: r.created_at as string,
    by: (r.created_by as string | null) ?? '—',
    cost: Number(r.cost_usd),
    error: (r.error as string | null) ?? null,
    sent: Boolean((r.output as { sent?: boolean } | null)?.sent),
    headline: ((r.output as { text?: { headline?: string } } | null)?.text?.headline) ?? null,
  }));

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: 1100 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Ранковий дайджест</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 18px' }}>
        Щоранку о 07:30 (улітку) / 06:30 (узимку) у Telegram: що вимагає дії сьогодні, що варто глянути, що в нормі.
        Цифри рахує код за тими самими правилами, що й журнал і «Огляд»; модель лише розставляє пріоритети й пише текст.
      </p>
      <DigestClient enabled={enabled} history={history} />
    </div>
  );
}
