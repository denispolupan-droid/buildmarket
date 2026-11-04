import { NextRequest, NextResponse } from 'next/server';
import { rzDepartments } from '../../../../lib/rz-delivery-api';
import { rzFitsWeight, rzWeightLimitKg, rzDepartmentLabel } from '../../../../lib/rz-delivery';
import { withApi } from '../../../../lib/api-handler';

// Точки видачі міста для чекауту, вже відфільтровані під вагу замовлення.
//
// Фільтр саме тут, а не в браузері: ліміт точки — це умова перевізника, і
// показати покупцю точку, яка його посилку не прийме, означає зірвати
// відправлення вже після оплати. Вага з клієнта тут не «гроші» і підробка їй
// нічого не дає — при створенні накладної ми все одно рахуємо вагу з БД.

async function _GET(req: NextRequest) {
  const cityId = req.nextUrl.searchParams.get('city') ?? '';
  const weight = parseFloat(req.nextUrl.searchParams.get('weight') ?? '0') || 0;
  if (!cityId) return NextResponse.json({ departments: [] });

  try {
    const all = await rzDepartments(cityId);
    const departments = all
      .filter(d => rzFitsWeight(d, weight))
      .map(d => ({
        id:       d.id,
        label:    rzDepartmentLabel(d),
        // API Rozetka віддає вихідний як «Нд: null-null» — покупцю показуємо «вихідний»
        schedule: (d.schedule ?? []).map(s => s.replace(/null\s*-\s*null/gi, 'вихідний')),
        limitKg:  rzWeightLimitKg(d),
      }));
    return NextResponse.json({ departments, total: all.length });
  } catch (err) {
    console.error('[rz-delivery/departments]', err);
    return NextResponse.json({ departments: [], error: 'Довідник відділень недоступний' }, { status: 502 });
  }
}

export const GET = withApi('rz-delivery/departments', _GET);
