import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { getRole } from '../../../../../lib/user-role';

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
  const data = await res.json();
  return data;
}

function normalizePhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('38')) return d.slice(2);
  return d;
}

function todayStr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || getRole(user) !== 'dropship') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: customer } = await serviceClient
    .from('customers')
    .select('id, balance, balance_held, name, email')
    .eq('auth_user_id', user.id)
    .single();

  if (!customer) return NextResponse.json({ error: 'Партнера не знайдено' }, { status: 404 });

  const { rows } = await req.json() as { rows: any[] };
  if (!rows?.length) return NextResponse.json({ error: 'Немає рядків для обробки' }, { status: 400 });

  // Фінальна перевірка балансу
  const totalCost  = rows.reduce((s: number, r: any) => s + r.cost_price * r.qty, 0);
  const balanceAvail = Number(customer.balance) - Number(customer.balance_held);
  if (balanceAvail < totalCost) {
    return NextResponse.json({ error: `Недостатньо балансу. Потрібно ${totalCost.toFixed(2)} ₴` }, { status: 400 });
  }

  const results: { row_num: number; status: 'ok' | 'error'; order_number?: number; ttn?: string; error?: string }[] = [];

  for (const row of rows) {
    try {
      // Крок 1: Отримувач в НП
      const cRes = await npCall('Counterparty', 'save', {
        FirstName:            row.first_name,
        LastName:             row.last_name,
        MiddleName:           row.mid_name ?? '',
        Phone:                normalizePhone(row.phone),
        CounterpartyType:     'PrivatePerson',
        CounterpartyProperty: 'Recipient',
        CityRef:              row.city_ref,
      });

      if (!cRes.success) throw new Error(cRes.errors?.join('; ') ?? 'Помилка отримувача НП');
      const recipientRef        = cRes.data[0].Ref;
      const contactRecipientRef = cRes.data[0].ContactPerson?.data?.[0]?.Ref ?? recipientRef;

      // Крок 2: ТТН
      const codAmount = parseFloat(row.selling_price) * row.qty;
      const ttnRes = await npCall('InternetDocument', 'save', {
        PayerType:       'Sender',
        PaymentMethod:   'Cash',
        DateTime:        todayStr(),
        CargoType:       'Cargo',
        Weight:          '1',
        ServiceType:     'WarehouseWarehouse',
        SeatsAmount:     '1',
        Description:     'Будівельна хімія',
        Cost:            String(Math.round(codAmount)),
        CitySender:      process.env.NP_SENDER_CITY_REF,
        Sender:          process.env.NP_SENDER_REF,
        SenderAddress:   process.env.NP_SENDER_WAREHOUSE_REF,
        ContactSender:   process.env.NP_SENDER_CONTACT_REF,
        SendersPhone:    normalizePhone(process.env.NP_SENDER_PHONE ?? ''),
        CityRecipient:   row.city_ref,
        Recipient:       recipientRef,
        RecipientAddress: row.warehouse_ref,
        ContactRecipient: contactRecipientRef,
        RecipientsPhone:  normalizePhone(row.phone),
        BackwardDeliveryData: [{
          PayerType: 'Recipient', CargoType: 'Money',
          RedeliveryString: codAmount.toFixed(2),
        }],
      });

      if (!ttnRes.success) throw new Error(ttnRes.errors?.join('; ') ?? 'Помилка ТТН НП');
      const ttn = ttnRes.data?.[0]?.IntDocNumber;
      if (!ttn) throw new Error('НП не повернула номер ТТН');

      // Крок 3: Замовлення в БД
      const { data: order, error: orderErr } = await serviceClient
        .from('orders')
        .insert({
          status:           'new',
          channel_code:     'dropship',
          partner_code:     customer.id,
          contact:          `${row.last_name} ${row.first_name} ${row.mid_name ?? ''}`.trim(),
          phone:            row.phone,
          email:            customer.email ?? user.email,
          company:          customer.name,
          delivery_type:    'nova',
          delivery_subtype: 'warehouse',
          delivery_address: `${row.city_name}, ${row.warehouse_name}`,
          delivery_city_ref:       row.city_ref,
          delivery_city_name:      row.city_name,
          delivery_warehouse_ref:  row.warehouse_ref,
          payment_type:     'cod',
          tracking_number:  ttn,
          items: [{
            sku: row.sku, name: row.product_name, brand: '',
            qty: row.qty, price: row.selling_price,
          }],
          total_price: codAmount,
        })
        .select('id, order_number')
        .single();

      if (orderErr || !order) throw new Error(orderErr?.message ?? 'Помилка створення замовлення');

      // Крок 4: Списання балансу
      await serviceClient.from('partner_balance_transactions').insert({
        customer_id:  customer.id,
        tx_type:      'charge',
        amount:       -(row.cost_price * row.qty),
        order_id:     order.id,
        description:  `Замовлення #${order.order_number}: ${row.product_name} × ${row.qty}`,
        created_by:   'system',
      });

      results.push({ row_num: row.row_num, status: 'ok', order_number: order.order_number, ttn });

    } catch (err) {
      results.push({
        row_num: row.row_num, status: 'error',
        error: err instanceof Error ? err.message : 'Невідома помилка',
      });
    }
  }

  const ok    = results.filter(r => r.status === 'ok').length;
  const fails = results.filter(r => r.status === 'error').length;

  return NextResponse.json({ results, ok, fails });
}
