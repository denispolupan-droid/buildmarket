import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '../../../lib/supabase-server';

export async function POST(req: NextRequest) {
  const { sku, email, name } = await req.json();

  if (!sku || !email || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  // Зберігаємо в таблицю stock_notifications
  const { error } = await admin.from('stock_notifications').upsert(
    { sku, email: email.toLowerCase().trim(), product_name: name, created_at: new Date().toISOString() },
    { onConflict: 'sku,email' }
  );

  if (error) {
    console.error('[notify-stock]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
