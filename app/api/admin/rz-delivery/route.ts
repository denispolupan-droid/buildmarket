import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { rzSenderDepartments, rzVerify, rzBalance } from '../../../../lib/rz-delivery-api';
import { rzDepartmentLabel, rzWeightLimitKg } from '../../../../lib/rz-delivery';

// Службові дані для екрана «Налаштування → ROZETKA Доставка».
//
// Дві операції в одному роуті, бо обидві — «покажи, що там у кабінеті»:
//   ?action=points&city=<uuid> — точки, куди МИ можемо здавати відправлення;
//   ?action=verify             — чи живий токен, статус партнера і баланс.
//
// Публічний проксі довідників для цього не годиться: там точки фільтруються по
// видачі покупцю (can_give_out_tracks) і по вазі замовлення, а нам потрібні
// приймаючі (can_receive_tracks) і разом з лімітами.

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const action = req.nextUrl.searchParams.get('action');

  if (action === 'verify') {
    try {
      const partner = await rzVerify();
      const balance = await rzBalance();
      return NextResponse.json({
        ok: true,
        partner: {
          name: partner.name, status: partner.status,
          phone: partner.phone, email: partner.email,
          autoblockDate: partner.autoblock_date ?? null,
        },
        balance: balance?.amount ?? null,
      });
    } catch (err) {
      return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (action === 'points') {
    const city = req.nextUrl.searchParams.get('city') ?? '';
    if (!city) return NextResponse.json({ points: [] });
    try {
      const points = (await rzSenderDepartments(city)).map(d => ({
        id:           d.id,
        label:        rzDepartmentLabel(d),
        limitKg:      rzWeightLimitKg(d),
        selfService:  Boolean(d.can_self_service),
      }));
      return NextResponse.json({ points });
    } catch (err) {
      console.error('[admin/rz-delivery points]', err);
      return NextResponse.json({ points: [], error: 'Довідник відділень недоступний' }, { status: 502 });
    }
  }

  return NextResponse.json({ error: 'Невідома дія' }, { status: 400 });
}
