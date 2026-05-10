import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { getRole } from '../../../../lib/user-role';

const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function npCall(modelName: string, calledMethod: string, props: object) {
  const res = await fetch(NP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: process.env.NOVA_POSHTA_API_KEY, modelName, calledMethod, methodProperties: props }),
  });
  return res.json();
}

function normalizePhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('38')) return d.slice(2);
  if (d.length === 11 && d.startsWith('8'))  return '0' + d.slice(1);
  return d;
}

function todayStr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || getRole(user) !== 'dropship') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { items, recipient, weight, comment, cod_amount } = await req.json();

  if (!items?.length)          return NextResponse.json({ error: 'Немає товарів' }, { status: 400 });
  if (!recipient?.city_ref)    return NextResponse.json({ error: 'Оберіть місто' }, { status: 400 });
  if (!recipient?.warehouse_ref) return NextResponse.json({ error: 'Оберіть відділення' }, { status: 400 });
  if (!recipient?.last_name)   return NextResponse.json({ error: 'Введіть прізвище' }, { status: 400 });
  if (!recipient?.phone)       return NextResponse.json({ error: 'Введіть телефон' }, { status: 400 });

  // ── Партнер і баланс ────────────────────────────────────────────────────────
  const { data: customer } = await serviceClient
    .from('customers')
    .select('id, balance, balance_held, name, email')
    .eq('auth_user_id', user.id)
    .single();

  if (!customer) return NextResponse.json({ error: 'Партнера не знайдено' }, { status: 404 });

  const totalCost    = items.reduce((s: number, i: { qty: number; cost_price: number }) => s + i.cost_price * i.qty, 0);
  const balanceAvail = Number(customer.balance) - Number(customer.balance_held);

  if (balanceAvail < totalCost) {
    return NextResponse.json({
      error: `Недостатньо балансу. Потрібно ${totalCost.toFixed(2)} ₴, доступно ${balanceAvail.toFixed(2)} ₴`,
    }, { status: 400 });
  }

  // ── Створення ТТН в Новій Пошті ─────────────────────────────────────────────
  // Крок 1: Отримувач
  const cRes = await npCall('Counterparty', 'save', {
    FirstName:            recipient.first_name,
    LastName:             recipient.last_name,
    MiddleName:           recipient.mid_name ?? '',
    Phone:                normalizePhone(recipient.phone),
    CounterpartyType:     'PrivatePerson',
    CounterpartyProperty: 'Recipient',
    CityRef:              recipient.city_ref,
  });

  if (!cRes.success) {
    return NextResponse.json({
      error: `НП: помилка створення отримувача — ${cRes.errors?.join('; ') ?? 'невідома помилка'}`,
    }, { status: 400 });
  }

  const recipientRef        = cRes.data[0].Ref;
  const contactRecipientRef = cRes.data[0].ContactPerson?.data?.[0]?.Ref ?? recipientRef;

  // Крок 2: ТТН
  const codAmount  = parseFloat(cod_amount) || totalCost;
  const ttnPayload: Record<string, unknown> = {
    PayerType:      'Sender',
    PaymentMethod:  'Cash',
    DateTime:       todayStr(),
    CargoType:      'Cargo',
    Weight:         String(weight || 1),
    ServiceType:    'WarehouseWarehouse',
    SeatsAmount:    '1',
    Description:    'Будівельна хімія',
    Cost:           String(Math.round(codAmount)),
    CitySender:     process.env.NP_SENDER_CITY_REF,
    Sender:         process.env.NP_SENDER_REF,
    SenderAddress:  process.env.NP_SENDER_WAREHOUSE_REF,
    ContactSender:  process.env.NP_SENDER_CONTACT_REF,
    SendersPhone:   normalizePhone(process.env.NP_SENDER_PHONE ?? ''),
    CityRecipient:  recipient.city_ref,
    Recipient:      recipientRef,
    RecipientAddress: recipient.warehouse_ref,
    ContactRecipient: contactRecipientRef,
    RecipientsPhone:  normalizePhone(recipient.phone),
    BackwardDeliveryData: [{
      PayerType:       'Recipient',
      CargoType:       'Money',
      RedeliveryString: codAmount.toFixed(2),
    }],
  };

  const ttnRes = await npCall('InternetDocument', 'save', ttnPayload);

  if (!ttnRes.success) {
    return NextResponse.json({
      error: `НП: помилка створення ТТН — ${ttnRes.errors?.join('; ') ?? 'невідома помилка'}`,
    }, { status: 400 });
  }

  const ttn = ttnRes.data?.[0]?.IntDocNumber;
  if (!ttn) {
    return NextResponse.json({ error: 'НП не повернула номер ТТН' }, { status: 502 });
  }

  // ── Створення замовлення ─────────────────────────────────────────────────────
  const { data: order, error: orderErr } = await serviceClient
    .from('orders')
    .insert({
      status:           'new',
      channel_code:     'dropship',
      partner_code:     customer.id,
      contact:          `${recipient.last_name} ${recipient.first_name} ${recipient.mid_name ?? ''}`.trim(),
      phone:            recipient.phone,
      email:            customer.email ?? user.email,
      company:          customer.name,
      delivery_type:    'nova',
      delivery_subtype: 'warehouse',
      delivery_address: `${recipient.city_name}, ${recipient.warehouse_name}`,
      delivery_city_ref:       recipient.city_ref,
      delivery_city_name:      recipient.city_name,
      delivery_warehouse_ref:  recipient.warehouse_ref,
      payment_type:     'cod',
      tracking_number:  ttn,
      comment:          comment || null,
      items:            items.map((i: { sku: string; name: string; brand: string; qty: number; selling_price: number }) => ({
        sku: i.sku, name: `${i.brand} ${i.name}`, brand: i.brand,
        qty: i.qty, price: i.selling_price,
      })),
      total_price: codAmount,
    })
    .select('id, order_number')
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: `Помилка створення замовлення: ${orderErr?.message}` }, { status: 500 });
  }

  // ── Списання балансу ─────────────────────────────────────────────────────────
  const itemsList = items.map((i: { name: string; qty: number }) => `${i.name} × ${i.qty}`).join(', ');
  await serviceClient.from('partner_balance_transactions').insert({
    customer_id:  customer.id,
    tx_type:      'charge',
    amount:       -totalCost,
    order_id:     order.id,
    description:  `Замовлення #${order.order_number}: ${itemsList}`,
    created_by:   'system',
  });

  return NextResponse.json({ ok: true, order_number: order.order_number, ttn });
}
