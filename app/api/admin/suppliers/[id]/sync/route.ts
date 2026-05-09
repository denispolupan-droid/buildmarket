import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { syncSupplier } from '../../../../../../lib/supplier-sync';

async function checkAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.user_metadata?.role === 'admin';
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  try {
    const result = await syncSupplier(Number(id));
    // Очищаємо ISR-кеш каталогу і сторінок товарів
    revalidatePath('/catalog', 'page');
    revalidatePath('/shop', 'page');
    revalidatePath('/', 'page');
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Невідома помилка';

    // Пишемо помилку в лог
    const { createClient } = await import('@supabase/supabase-js');
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    await serviceClient.from('supplier_sync_log').insert({
      supplier_id:   Number(id),
      rows_total:    0,
      rows_updated:  0,
      rows_skipped:  0,
      rows_unmapped: 0,
      finished_at:   new Date().toISOString(),
      error_message: message,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
