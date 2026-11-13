import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/auth-guard';
import { withApi } from '../../../../lib/api-handler';
import { lookupCompanyByCode, normalizeCompanyCode } from '../../../../lib/company-lookup';

// Офіційна назва юрособи за ЄДРПОУ/ІПН (Нова Пошта, безкоштовно) — кнопка
// «Знайти» в картці контрагента. Нічого не записує.
async function _GET(req: NextRequest) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;
  const code = normalizeCompanyCode(req.nextUrl.searchParams.get('code'));
  if (!code) return NextResponse.json({ error: 'Код має бути 8 (ЄДРПОУ) або 10 (ІПН) цифр' }, { status: 400 });
  const company = await lookupCompanyByCode(code);
  if (!company) return NextResponse.json({ error: `За кодом ${code} нічого не знайдено` }, { status: 404 });
  return NextResponse.json({ company });
}

export const GET = withApi('admin/company-lookup', _GET);
