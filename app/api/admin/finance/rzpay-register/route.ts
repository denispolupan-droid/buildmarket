import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { applyRzPayRegisterFile } from '../../../../../lib/rozetkapay-register-apply';

// Імпорт виплат RozetkaPay з кабінету (реєстр XLSX або експорт транзакцій CSV) —
// склад виплат за фактом. Файл не зберігається: розбирається в пам'яті й одразу
// розноситься по замовленнях.
export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const formData = await req.formData().catch(() => null);
  const file = formData?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Файл не вказано' }, { status: 400 });
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!['xlsx', 'xls', 'csv'].includes(ext)) return NextResponse.json({ error: 'Потрібен файл із кабінету RozetkaPay: реєстр (.xlsx) або експорт транзакцій (.csv)' }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Файл занадто великий' }, { status: 400 });

  try {
    const result = await applyRzPayRegisterFile(Buffer.from(await file.arrayBuffer()), file.name, `rzpay-register:${auth.user.email ?? 'admin'}`);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[rzpay-register]', err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
