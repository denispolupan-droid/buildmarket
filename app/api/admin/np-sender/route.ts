import { NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ref          = process.env.NP_SENDER_REF;
  const contactRef   = process.env.NP_SENDER_CONTACT_REF;
  const phone        = process.env.NP_SENDER_PHONE ?? '';
  const cityRef      = process.env.NP_SENDER_CITY_REF;
  const warehouseRef = process.env.NP_SENDER_WAREHOUSE_REF;

  if (!ref || !contactRef || !cityRef || !warehouseRef) {
    return NextResponse.json(
      { error: 'Налаштування відправника НП не задані. Додайте NP_SENDER_* змінні у середовище Vercel.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ref,
    cityRef,
    contactRef,
    phone,
    warehouses: [{
      ref: warehouseRef,
      cityRef,
      description: process.env.NP_SENDER_WAREHOUSE_DESC ?? 'Відділення відправника',
      number: '1',
    }],
  });
}
