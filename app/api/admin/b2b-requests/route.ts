import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createServiceClient } from '../../../../lib/supabase-service';
import { requireStaff } from '../../../../lib/auth-guard';
import { parseBody, z } from '../../../../lib/validate';
import { ensurePartnerCustomer, roleForAccountType } from '../../../../lib/partner-customer';

// Заявки на B2B-доступ (опт / дропшип) — міграція 146. Новий партнер після
// реєстрації бачить роздріб, доки адмін не схвалить заявку тут.

const TYPE_LABEL: Record<string, string> = {
  dealer: 'Дилер', contractor: 'Підрядник', shop_owner: 'Магазин', wholesale: 'Опт', dropship: 'Дропшипер',
};

async function listAllUsers(db: ReturnType<typeof createServiceClient>): Promise<User[]> {
  const out: User[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    out.push(...(data.users ?? []));
    if ((data.users ?? []).length < 200) break;
  }
  return out;
}

export async function GET() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const users = await listAllUsers(createServiceClient());
  const requests = users
    .filter(u => ['pending', 'rejected'].includes(String(u.app_metadata?.b2b_status ?? '')))
    .map(u => {
      const meta = (u.user_metadata ?? {}) as Record<string, string | undefined>;
      const type = String(u.app_metadata?.requested_account_type ?? '');
      return {
        id:           u.id,
        email:        u.email ?? '',
        status:       String(u.app_metadata?.b2b_status),
        type,
        typeLabel:    TYPE_LABEL[type] ?? type,
        company:      meta.company_name ?? '',
        contact:      meta.contact_person ?? '',
        phone:        meta.phone ?? '',
        city:         meta.city ?? '',
        taxNumber:    meta.tax_number ?? '',
        requestedAt:  String(u.app_metadata?.b2b_requested_at ?? u.created_at),
        confirmed:    !!u.email_confirmed_at,
      };
    })
    .sort((a, b) => (a.status === b.status ? b.requestedAt.localeCompare(a.requestedAt) : a.status === 'pending' ? -1 : 1));

  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, z.object({
    userId: z.string().uuid(),
    action: z.enum(['approve', 'reject']),
  }));
  if (!body.ok) return body.response;
  const { userId, action } = body.data;

  const db = createServiceClient();
  const { data: got, error: getErr } = await db.auth.admin.getUserById(userId);
  if (getErr || !got.user) return NextResponse.json({ error: 'Користувача не знайдено' }, { status: 404 });
  const user = got.user;
  const requested = String(user.app_metadata?.requested_account_type ?? '');
  const role = roleForAccountType(requested);
  if (!role) return NextResponse.json({ error: 'У користувача немає заявки на B2B-доступ' }, { status: 409 });

  const decidedBy = auth.user.email ?? 'admin';
  const decidedAt = new Date().toISOString();

  if (action === 'reject') {
    const { error } = await db.auth.admin.updateUserById(userId, {
      app_metadata: { ...user.app_metadata, account_type: 'retail', b2b_status: 'rejected', b2b_decided_by: decidedBy, b2b_decided_at: decidedAt },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: 'rejected' });
  }

  // Схвалення: спершу контрагент і договір, потім роль — щоб партнер, який
  // увійде одразу після схвалення, не опинився в кабінеті без контрагента.
  try {
    await ensurePartnerCustomer(user, role);
  } catch (err) {
    return NextResponse.json({ error: `Контрагента не створено: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
  const { error } = await db.auth.admin.updateUserById(userId, {
    app_metadata: { ...user.app_metadata, account_type: requested, b2b_status: 'approved', b2b_decided_by: decidedBy, b2b_decided_at: decidedAt },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status: 'approved' });
}
