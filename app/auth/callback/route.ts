import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { getRole } from '../../../lib/user-role';
import { createServiceClient } from '../../../lib/supabase-service';
import { ensurePartnerCustomer } from '../../../lib/partner-customer';
import { alertAdmin } from '../../../lib/alert';

const serviceClient = createServiceClient();

// Заявка на B2B-доступ (міграція 146): сповіщаємо адміна один раз — коли
// партнер підтвердив email, тобто заявка справжня, а не недорегістрація.
async function notifyB2BRequest(user: User) {
  const app = user.app_metadata ?? {};
  if (app.b2b_status !== 'pending' || app.b2b_notified) return;
  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  alertAdmin(
    'Нова заявка на B2B-доступ',
    [meta.company_name, meta.contact_person, user.email, meta.phone, app.requested_account_type].filter(Boolean).join(' · ')
      + ' — Налаштування → Користувачі',
  );
  await serviceClient.auth.admin.updateUserById(user.id, { app_metadata: { ...app, b2b_notified: true } });
}

// Supabase redirects here after email confirmation
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  // Валідація next проти open redirect: лише внутрішні шляхи (не //host, не https://host).
  const rawNext = searchParams.get('next') ?? '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      const role = getRole(user);

      if (role === 'dropship' || role === 'wholesale') {
        await ensurePartnerCustomer(user!, role);
      } else if (user) {
        await notifyB2BRequest(user).catch(err => console.error('[auth/callback] b2b notify failed:', err));
      }

      if (role === 'dropship') {
        return NextResponse.redirect(`${origin}/cabinet`);
      }
      if (user?.app_metadata?.role === 'admin') {
        return NextResponse.redirect(`${origin}/admin`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
