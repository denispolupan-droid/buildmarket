import { describe, it, expect } from 'vitest';
import {
  epicentrOrderToOurFormat, epicentrPaymentType, epicentrDeliveryType, ourStatusToEpicentrStatus,
  buildEpicentrComment, EPICENTR_CANCELLED, type EpicentrOrder,
} from '../lib/epicentr-api';
import { epicentrPrice, epicentrMargin } from '../lib/marketplace-pricing';
import { epicentrAvailabilityOf, toEpicentrId, fromEpicentrId } from '../lib/epicentr-availability';
import { epicentrName, epicentrDescription, epicentrWeightGrams, epicentrBrand } from '../lib/epicentr-content';
import { mapEpicentrAttributes, toUnit } from '../lib/epicentr-attributes';
import { webpRelFromImage, jpegKeyFor, staticJpegUrl, dynamicJpegUrl } from '../lib/epicentr-images';

// Форма замовлення — за OrdersGridItemModel зі свагера merchant-api.epicentrm.com.ua
function order(over: Partial<EpicentrOrder> = {}): EpicentrOrder {
  return {
    id: '6f3d2c1e-0000-4000-8000-000000000001',
    number: '7788990',
    companyId: 'c0214ac8-500d-45fb-af67-769fad53e90c',
    createdAt: '2026-09-08T10:00:00+00:00',
    statusCode: 'new',
    subtotal: 1240,
    payed: false,
    skipCustomerContact: false,
    comment: '',
    items: [
      { offerId: 'o1', productId: '123', productExternalId: '1901017', sku: 'EP-1', title: 'Пластифікатор 10 л', price: 620, quantity: 2, ratio: 1, measure: 'шт' },
    ],
    address: {
      firstName: 'Петро', lastName: 'Петрушенко', email: 'p@test.com', phone: '380661112233',
      isAlternateRecipient: false,
      recipient: { firstName: 'Петро', lastName: 'Петрушенко', phone: '380661112233' },
      shipment: { provider: 'nova_poshta', paymentProvider: 'pay_on_delivery', settlementId: 'x', officeId: 'y', number: null, isFree: false },
    },
    cancel: null,
    ...over,
  };
}

describe('epicentrOrderToOurFormat', () => {
  it('накладений платіж НП → cod, не оплачено, артикул з productExternalId', () => {
    const m = epicentrOrderToOurFormat(order());
    expect(m.channel_code).toBe('epicentr');
    expect(m.epicentr_order_id).toBe('6f3d2c1e-0000-4000-8000-000000000001');
    expect(m.payment_type).toBe('cod');
    expect(m.paid).toBe(false);
    expect(m.delivery_type).toBe('nova_poshta');
    expect(m.delivery_subtype).toBe('warehouse');
    expect(m.items).toEqual([{ sku: '1901-017', name: 'Пластифікатор 10 л', brand: '', qty: 2, price: 620 }]);
    expect(m.total_price).toBe(1240);
    expect(m.contact).toBe('Петро Петрушенко');
    expect(m.phone).toBe('380661112233');
  });

  it('онлайн-оплата з payed=true → prepaid (гроші в Епіцентра)', () => {
    const o = order({ payed: true });
    o.address.shipment.paymentProvider = 'monobank';
    const m = epicentrOrderToOurFormat(o);
    expect(m.payment_type).toBe('prepaid');
    expect(m.paid).toBe(true);
  });

  it('онлайн-оплата ще не пройшла → invoice, не оплачено', () => {
    expect(epicentrPaymentType('easypay', false)).toEqual({ paymentType: 'invoice', paid: false });
    expect(epicentrPaymentType('invoice', false)).toEqual({ paymentType: 'invoice', paid: false });
  });

  it('альтернативний отримувач — контакт і телефон з recipient', () => {
    const o = order();
    o.address.isAlternateRecipient = true;
    o.address.recipient = { firstName: 'Марія', lastName: 'Іваненко', phone: '380501234567' };
    const m = epicentrOrderToOurFormat(o);
    expect(m.contact).toBe('Марія Іваненко');
    expect(m.phone).toBe('380501234567');
  });

  it('картка (/v6) дає назви міста/відділення → адреса рядком, місто окремо', () => {
    const o = order({ settlement: { title: 'Харків' }, office: { title: 'Відділення №7' } });
    const m = epicentrOrderToOurFormat(o);
    expect(m.delivery_city_name).toBe('Харків');
    expect(m.delivery_address).toBe('Харків, Відділення №7');
    expect(m.delivery_city_ref).toBeNull();
  });

  it('поштомат Епіцентру → meest + postomat; кур\'єр з будинком → address', () => {
    const o = order();
    o.address.shipment.provider = 'parcel_box_epicentr';
    expect(epicentrOrderToOurFormat(o).delivery_subtype).toBe('postomat');
    expect(epicentrDeliveryType('cvz_epicentr')).toBe('meest');
    const c = order();
    c.address.shipment.provider = 'courier_delivery';
    c.address.shipment.house = '12';
    c.address.shipment.apartment = '4';
    const m = epicentrOrderToOurFormat(c);
    expect(m.delivery_type).toBe('courier');
    expect(m.delivery_subtype).toBe('address');
    expect(m.delivery_address).toBe('буд. 12, кв. 4');
  });

  it('коментар: «не передзвонювати» + нотатка покупця + коментар до доставки', () => {
    const o = order({ skipCustomerContact: true, comment: 'Дзвонити після 18' });
    o.address.shipment.comment = 'Домофон 12';
    expect(buildEpicentrComment(o)).toBe('Не передзвонювати. Дзвонити після 18. Домофон 12');
    expect(buildEpicentrComment(order())).toBeNull();
  });
});

describe('статуси', () => {
  it('наш → Епіцентр: підтвердження, відправка, скасування; delivered не пушимо', () => {
    expect(ourStatusToEpicentrStatus('confirmed')).toBe('confirmed_by_merchant');
    expect(ourStatusToEpicentrStatus('picking')).toBe('confirmed_by_merchant');
    expect(ourStatusToEpicentrStatus('shipped')).toBe('sent');
    expect(ourStatusToEpicentrStatus('cancelled')).toBe('canceled_by_merchant');
    expect(ourStatusToEpicentrStatus('delivered')).toBeNull();
    expect(ourStatusToEpicentrStatus('new')).toBeNull();
  });

  it('скасовані покупцем/площадкою — canceled, returned, return_requested', () => {
    expect(EPICENTR_CANCELLED).toContain('canceled');
    expect(EPICENTR_CANCELLED).not.toContain('canceled_by_merchant');
  });
});

describe('epicentrPrice — формула фіда й пушу', () => {
  // Той самий референс, що в marketplace-pricing.test: вхід 497.30, роздріб 547
  const base = { cost: 497.3, retail: 547, productMarkupPct: 12, categoryMarkupPct: 0 };

  it('вхід × 1.12 ÷ (1 − 0.12) → ceil до 1 грн = 633', () => {
    expect(epicentrPrice({ ...base, commissionPct: 12 })).toBe(633);
  });

  it('без комісії й націнки — роздрібна як є', () => {
    expect(epicentrPrice({ cost: 497.3, retail: 547, productMarkupPct: null, categoryMarkupPct: null, commissionPct: 0 })).toBe(547);
  });

  it('без ціни входу база — роздріб', () => {
    expect(epicentrPrice({ cost: null, retail: 500, productMarkupPct: null, categoryMarkupPct: 10, commissionPct: 10 })).toBe(Math.ceil(500 * 1.1 / 0.9));
  });

  it('маржа: ціна × (1 − комісія) − вхід', () => {
    const m = epicentrMargin({ ...base, commissionPct: 12 })!;
    expect(m.uah).toBeCloseTo(633 * 0.88 - 497.3, 2);
    expect(epicentrMargin({ ...base, cost: null, commissionPct: 12 })).toBeNull();
  });
});

describe('epicentrAvailabilityOf — те саме правило, що у фіді', () => {
  it('вимкнений товар — not_available попри залишок', () => {
    expect(epicentrAvailabilityOf(false, { stock_qty: 5, stock_status: 'in_stock' })).toBe('not_available');
  });
  it('статус in_stock або залишок ≥ 1 — in_stock', () => {
    expect(epicentrAvailabilityOf(true, { stock_qty: 0, stock_status: 'in_stock' })).toBe('in_stock');
    expect(epicentrAvailabilityOf(true, { stock_qty: 3, stock_status: 'out_of_stock' })).toBe('in_stock');
    expect(epicentrAvailabilityOf(true, { stock_qty: 0, stock_status: 'out_of_stock' })).toBe('not_available');
  });
});

describe('epicentrContent — назва, опис, вага за вимогами Епіцентру', () => {
  it('назва: без ком, з артикулом у дужках, ≤150 символів', () => {
    const n = epicentrName({ sku: '2101-022', name: 'Емаль Polifarb DekoMal ПФ-115 темно зелена, 2,7 кг', brand: 'Polifarb', volume: '2,7 кг', color: 'Темно-зелений' });
    expect(n).not.toMatch(/,/);
    expect(n.endsWith(' (2101-022)')).toBe(true);
    expect(n.length).toBeLessThanOrEqual(150);
    expect(n).toMatch(/^Емаль/);
  });

  it('назва: розміри через маленьку «х», стоп-слова прибрані, довга — обрізається під артикул', () => {
    const n = epicentrName({ sku: 'X', name: 'Диск зачисний Ataman 125x6,0x22 мм Акція', brand: 'Ataman' });
    expect(n).toContain('125х6.0х22');
    expect(n).not.toMatch(/акція/i);
    const long = epicentrName({ sku: 'LONG-1', name: 'А'.repeat(200), brand: null });
    expect(long.length).toBe(150);
    expect(long.endsWith('(LONG-1)')).toBe(true);
  });

  it('опис: дозволені теги лишаються, посилання/атрибути/оклики — ні, ліміт 1500', () => {
    const d = epicentrDescription('<h2 class="x">Заголовок!</h2><p>Текст <strong>жирний</strong> <a href="https://x.ua">лінк</a> https://fixline.com.ua/p</p><ol><li>один</li></ol>');
    expect(d).toBe('<p>Заголовок.</p><p>Текст <b>жирний</b> лінк </p><ul><li>один</li></ul>');
    const long = epicentrDescription('<p>' + 'Речення про товар. '.repeat(120) + '</p>');
    expect(long.length).toBeLessThanOrEqual(1500);
    expect(long.endsWith('</p>')).toBe(true);
  });

  it('вага: характеристика > кг/г фасування > об\'єм × щільність', () => {
    expect(epicentrWeightGrams({ name: 'Фарба', volume: '2,7 кг' })).toBe(2835);
    expect(epicentrWeightGrams({ name: 'Клей', volume: '400 г' })).toBe(420);
    expect(epicentrWeightGrams({ name: 'Емаль ПФ-115', volume: '1 л' })).toBe(1418);
    expect(epicentrWeightGrams({ name: 'Піна монтажна', volume: '750 мл' })).toBe(788);
    expect(epicentrWeightGrams({ name: 'Стрічка', volume: '50 м', characteristics: [{ label: 'Вага', value: '1,2 кг' }] })).toBe(1260);
    expect(epicentrWeightGrams({ name: 'Стрічка', volume: '50 м', characteristics: [{ label: 'Вага упаковки', value: '0,35 кг' }] })).toBe(368);
    expect(epicentrWeightGrams({ name: 'Стрічка', volume: '50 м' })).toBeNull();
  });
});

describe('toEpicentrId / fromEpicentrId — артикул без розділових знаків', () => {
  it('1603-014 ↔ 1603014, чужі значення не чіпаємо', () => {
    expect(toEpicentrId('1603-014')).toBe('1603014');
    expect(fromEpicentrId('1603014')).toBe('1603-014');
    expect(fromEpicentrId('EP-1')).toBe('EP-1');
    expect(fromEpicentrId(undefined)).toBe('');
  });
});

describe('mapEpicentrAttributes — характеристики за словниками Епіцентру', () => {
  it('герметик: тип/основа/призначення/сфера з наших характеристик, об’єм↔вага перехресно', () => {
    const r = mapEpicentrAttributes('4030', {
      name: 'Герметик силіконовий Lacrysil санітарний білий 280 мл', color: 'Білий', volume: '280 мл',
      characteristics: [
        { label: 'Матеріал', value: 'Силіконовий' }, { label: 'Призначення', value: 'Санітарний' },
        { label: 'Тип використання', value: 'Внутрішні та зовнішні роботи' }, { label: 'Форма випуску', value: 'Картридж' },
        { label: 'Водостійкість', value: 'Так' },
      ],
    });
    const by = Object.fromEntries(r.params.map(p => [p.title + ':' + p.type, p]));
    expect(by['Тип:multiselect'].value).toBe('санітарний');
    expect(by['Основа:select'].value).toBe('силікон');
    expect(by['Упаковка:select'].value).toBe('картридж');
    expect(by['Сфера застосування:multiselect'].value).toBe('для внутрішніх і зовнішніх робіт');
    expect(by['Призначення:multiselect'].value).toContain('для ванної кімнати');
    expect(by['Базовий колір:multiselect'].value).toBe('білий');
    expect(r.params.find(p => p.code === '10064')!.value).toBe('280');   // Об'єм, мл
    expect(r.params.find(p => p.code === '10066')!.value).toBe('280');   // Вага, г — щільність 1
    expect(r.params.every(p => p.type === 'float' || p.type === 'text' || p.valuecode)).toBe(true);
    expect(r.missingRequired).toEqual([]);
  });

  it('колорант: колір → базовий колір і відтінок, застосування з «Тип використання», дефолт основи', () => {
    const r = mapEpicentrAttributes('3203', {
      name: 'Колорант Polifarb Color Mix арт.04 кавовий 0,12 л', color: 'Кавовий', volume: '0,12 л',
      characteristics: [{ label: 'Колір', value: 'Кавовий' }, { label: 'Тип використання', value: 'Внутрішні роботи' }, { label: 'Основа', value: 'Акрилова' }],
    });
    const titles = Object.fromEntries(r.params.map(p => [p.code, p.value]));
    expect(titles['12097']).toBe('коричневий');
    expect(titles['2879']).toBe('для внутрішніх робіт');
    expect(titles['2889']).toBe('Кавовий');
    expect(titles['1098']).toBe('120');
    expect(titles['3150']).toBe('на водній основі');
    expect(r.missingRequired).toEqual([]);
  });

  it('фуга: дефолти категорії закривають обов’язкові select-поля', () => {
    const r = mapEpicentrAttributes('2326', {
      name: 'Затирка Ceresit CE 40 Aquastatic сіра 2 кг', color: 'Сірий', volume: '2 кг',
      characteristics: [{ label: 'Тип', value: 'Цементна затирка' }, { label: 'Основа', value: 'Цементна' }, { label: 'Ширина шва', value: '1–6 мм' }],
    });
    const v = Object.fromEntries(r.params.map(p => [p.title, p.value]));
    expect(v['Основа']).toBe('на цементній основі');
    expect(v['Компонентність']).toBe('однокомпонентний');
    expect(v['Жаростійка']).toBe('ні');
    expect(v['Максимальна ширина шва, мм']).toBe('6');
    expect(v['Особливості']).toContain('гідрофобізований');
    expect(r.missingRequired).toEqual([]);
  });

  it('невідомий набір — порожній результат; toUnit конвертує одиниці під суфікс', () => {
    expect(mapEpicentrAttributes('999999', { name: 'x' }).params).toEqual([]);
    expect(toUnit('2,7 кг', 'г', '')).toBe(2700);
    expect(toUnit('750 мл', 'л', '')).toBe(0.75);
    expect(toUnit('30 хв', 'год', '')).toBe(0.5);
    expect(toUnit('7 діб', 'год', '')).toBe(168);
    expect(toUnit('2 роки', 'міс.', '')).toBe(24);
    expect(toUnit('1–6 мм', 'мм', 'Максимальна ширина шва, мм')).toBe(6);
  });
});

describe('epicentrBrand — бренди поза довідником Епіцентру', () => {
  it('Tangit показуємо як Ceresit, решту брендів — як є', () => {
    expect(epicentrBrand('Tangit')).toBe('Ceresit');
    expect(epicentrBrand('Pattex')).toBe('Pattex');
    expect(epicentrBrand(null)).toBe('');
  });
  it('Хімконтакт, Spitce, HARDEX, ПОЛЯРА-ХИМ на Епіцентр не йдуть', () => {
    for (const b of ['Хімконтакт', 'Spitce', 'HARDEX', 'ПОЛЯРА-ХИМ']) expect(epicentrBrand(b)).toBeNull();
  });
});

describe('epicentrName — фасування і колір не задвоюються (звіт кабінету 12.09)', () => {
  it('фасування в кінці назви не дописується вдруге', () => {
    expect(epicentrName({ sku: '2100-007', name: 'Фарба Polifarb ExtraLatex 1,4 кг', brand: 'Polifarb', volume: '1,4 кг' }))
      .toBe('Фарба Polifarb ExtraLatex 1.4 кг (2100-007)');
    expect(epicentrName({ sku: '2109-012', name: 'Aura Luxpro 1 — Абсолютно матова стійка до миття фарба, 0,95 л', brand: 'AURA', volume: '0,95 л' }))
      .toBe('Абсолютно матова стійка до миття фарба AURA Luxpro 1 0.95 л (2109-012)');
  });
  it('колір, що вже є в назві іншою формою, у кінець не дописується', () => {
    expect(epicentrName({ sku: '2101-022', name: 'Емаль Polifarb DekoMal ПФ-115 темно зелена, 2,7 кг', brand: 'Polifarb', volume: '2,7 кг', color: 'Темно-зелений' }))
      .toBe('Емаль Polifarb DekoMal ПФ-115 темно зелена 2.7 кг (2101-022)');
  });
});

describe('epicentr-images — адреси статичних JPEG', () => {
  it('WebP з /img/products → rel; інші адреси — null', () => {
    expect(webpRelFromImage('/img/products/aura/1204-018-482798b36e.webp')).toBe('aura/1204-018-482798b36e');
    expect(webpRelFromImage('https://fixline.com.ua/img/products/2100-014.webp')).toBe('2100-014');
    expect(webpRelFromImage('/img/products/lotus/2107-005.jpg')).toBeNull();
    expect(webpRelFromImage(null)).toBeNull();
  });
  it('статична адреса — під /img/products/epicentr, кирилиця кодується', () => {
    expect(jpegKeyFor('aura/x-1')).toBe('epicentr/aura/x-1.jpg');
    expect(staticJpegUrl('дніпро-м/5596-207')).toMatch(/\/img\/products\/epicentr\/%D0%B4%D0%BD%D1%96%D0%BF%D1%80%D0%BE-%D0%BC\/5596-207\.jpg$/);
    expect(dynamicJpegUrl('aura/x-1')).toMatch(/\/api\/epicentr\/img\/aura\/x-1\.jpg$/);
  });
});
