import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/auth-guard';
import { createServiceClient } from '../../../../lib/supabase';
import { getNpApiKey, npCall } from '../../../../lib/np-api';
import {
  prepareCourierAddress, resolveCityRef,
  type RozetkaDelivery, type PromProviderData, type CourierAddressResult,
} from '../../../../lib/np-address';

/**
 * Підказка для модалки «Створити ТТН» (кур'єр): яку вулицю НП підставить за
 * текстом адреси й обраним населеним пунктом — або список схожих, якщо не
 * знайшло. Та сама логіка, що й у /api/admin/create-ttn (lib/np-address), тож
 * менеджер бачить саме те, що піде в накладну, ще до натискання кнопки.
 * Лише довідникові читання НП, нічого не створює.
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null) as { orderId?: string; settlementRef?: string; text?: string } | null;
  const orderId = body?.orderId?.trim();
  const settlementRef = body?.settlementRef?.trim();
  const text = (body?.text ?? '').trim();
  if (!orderId || !settlementRef || !text) {
    return NextResponse.json({ error: 'orderId, settlementRef і text обов\'язкові' }, { status: 400 });
  }

  const apiKey = await getNpApiKey();
  if (!apiKey) return NextResponse.json({ error: 'API ключ НП не налаштовано' }, { status: 400 });
  const np = (m: string, c: string, p: Record<string, unknown>) => npCall(apiKey, m, c, p);

  const { data: ord } = await createServiceClient()
    .from('orders')
    .select('delivery_city_name, rz:rozetka_data->delivery, pm:prom_data->delivery_provider_data')
    .eq('id', orderId)
    .maybeSingle();

  const cityRef = await resolveCityRef(np, settlementRef);
  if (!cityRef) {
    return NextResponse.json({ error: 'Не вдалося визначити місто НП для адресної доставки. Оберіть населений пункт зі списку НП.' }, { status: 400 });
  }

  const result: CourierAddressResult = await prepareCourierAddress(np, {
    text,
    cityName: (ord?.delivery_city_name as string | null) ?? null,
    rz: ord?.rz as RozetkaDelivery,
    pm: ord?.pm as PromProviderData,
    settlementRef,
    cityRef,
  });
  return NextResponse.json(result);
}
