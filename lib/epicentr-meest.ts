/**
 * Накладні Meest для власної доставки Епіцентру — поштомати («Meest-Епіцентр
 * Поштомати», parcel_box_epicentr) і пункти видачі («Самовивіз Meest-Епіцентр»,
 * cvz_epicentr). Чистий модуль: без мережі, його читають і роут, і вікно в адмінці.
 *
 * Як це влаштовано (12.11.2026, swagger Merchant API + інструкція
 * supportm.epicentrk.ua/creatingaditting_ttn):
 *  - накладну виписує Епіцентр за нашим договором Meest (Contract ID у кабінеті) —
 *    POST /v3/oms/orders/{id}/shipping/{provider}; сайт Meest для цих точок не підходить;
 *  - доставку платить продавець (для покупця безкоштовно), післяплати немає —
 *    покупець оплатив онлайн;
 *  - відправник здає посилку у звичайне відділення Meest: у тілі sender.provider =
 *    'meest' і відділення з довідника Meest (так само, як «Спосіб відправки: Meest»
 *    у формі кабінету). Список «відправника» для parcel_box_epicentr — це самі
 *    поштомати, нам він не потрібен;
 *  - одиниці — як у формі кабінету: сантиметри й кілограми (API приклад «200.5» без
 *    одиниць; поштомати Епіцентру описані в мм і г — це картка відділення, не накладна).
 */

export const EPICENTR_MEEST_PROVIDERS = ['parcel_box_epicentr', 'cvz_epicentr'] as const;
export type EpicentrMeestProvider = (typeof EPICENTR_MEEST_PROVIDERS)[number];

export const EPICENTR_MEEST_LABEL: Record<EpicentrMeestProvider, string> = {
  parcel_box_epicentr: 'поштомат Meest-Епіцентр',
  cvz_epicentr: 'пункт видачі Meest-Епіцентр',
};

/** Ключ app_settings: обране відділення Meest, куди здаємо посилки (не секрет). */
export const EPICENTR_MEEST_SENDER_KEY = 'epicentr_meest_sender';

/** Чи це замовлення з доставкою, накладну для якої виписує Епіцентр (за даними картки). */
export function epicentrMeestProvider(epicentrData: unknown): EpicentrMeestProvider | null {
  const p = (epicentrData as { address?: { shipment?: { provider?: unknown } } } | null)?.address?.shipment?.provider;
  return (EPICENTR_MEEST_PROVIDERS as readonly string[]).includes(String(p)) ? p as EpicentrMeestProvider : null;
}

// ── Відправник ───────────────────────────────────────────────────────────────

export type MeestOffice = { id: string; settlementId: string; title: string; address?: string | null };

const norm = (s: string) => s.toLowerCase()
  .replace(/[’'`ʼ]/g, '')
  // «32 А» → «32а» (\b у JS не бачить кирилицю як літери — тому lookahead по \p{L})
  .replace(/(\d+)\s*[-/]?\s*([а-яіїєґa-z])(?![\p{L}])/giu, '$1$2')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

/**
 * Відділення Meest за адресою точки, з якої вже відправляємо (Rozetka: «Харків,
 * вул. Богдана Хмельницького 32 А»). Шукаємо збіг номера будинку і найдовшого
 * слова вулиці — порядок слів у довідниках різний («Хмельницького Богдана, 32А»).
 */
export function matchMeestOffice(offices: MeestOffice[], address: string): MeestOffice | null {
  const a = norm(address);
  const house = a.split(' ').find(w => /^\d+[а-яіїєґa-z]?$/u.test(w));
  const words = a.split(' ').filter(w => w.length >= 5 && !/\d/.test(w)
    && !['харків', 'вулиця', 'проспект', 'провулок', 'площа', 'бульвар'].includes(w));
  const street = words.sort((x, y) => y.length - x.length)[0];
  if (!house || !street) return null;
  const stem = street.slice(0, Math.max(5, street.length - 3));   // «хмельницького» → «хмельниць»
  return offices.find(o => {
    const t = norm(`${o.title} ${o.address ?? ''}`);
    return t.split(' ').includes(house) && t.includes(stem);
  }) ?? null;
}

/** «Полупан Денис Олександрович» → поля відправника (порядок «Прізвище Ім'я По батькові»). */
export function splitSenderName(full: string): { lastName: string; name: string; middleName?: string } {
  const p = full.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return { lastName: '', name: '' };
  if (p.length === 1) return { lastName: p[0], name: p[0] };
  return { lastName: p[0], name: p[1], ...(p[2] ? { middleName: p.slice(2).join(' ') } : {}) };
}

/** Телефон у форматі 380XXXXXXXXX (так його віддає й приймає Епіцентр); '' — не розпізнано. */
export function epicentrPhone(raw: string | null | undefined): string {
  const d = (raw ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('380')) return d;
  if (d.length === 10 && d.startsWith('0')) return `38${d}`;
  if (d.length === 9) return `380${d}`;
  return '';
}

// ── Посилка ──────────────────────────────────────────────────────────────────

export type MeestSeat = { weightKg: number; lengthCm: number; widthCm: number; heightCm: number };

/** Комірка поштомата з картки замовлення /v6 (office.dimensions): мм і грами. */
export type ParcelBoxCell = { width?: number; height?: number; length?: number; weight?: number } | null | undefined;

/**
 * Обмеження з інструкцій Епіцентру (supportm.epicentrk.ua): ЦВЗ — до 30 кг, кожна
 * сторона до 70 см, об'єм до 0,118 м³; поштомат — до 29 кг (тариф) і розмір
 * комірки, якщо картка її віддає. null — посилка проходить.
 */
export function meestSeatProblem(seat: MeestSeat, provider: EpicentrMeestProvider, cell?: ParcelBoxCell): string | null {
  const { weightKg: w, lengthCm: l, widthCm: wd, heightCm: h } = seat;
  if (![w, l, wd, h].every(n => Number.isFinite(n) && n > 0)) return 'Вкажіть вагу і всі три габарити';
  if (provider === 'cvz_epicentr') {
    if (w > 30) return 'Пункт видачі приймає до 30 кг';
    if (Math.max(l, wd, h) > 70) return 'Пункт видачі: кожна сторона до 70 см';
    if ((l * wd * h) / 1e6 > 0.118) return 'Пункт видачі: об\'єм до 0,118 м³';
    return null;
  }
  const maxKg = cell?.weight ? Math.min(29, cell.weight / 1000) : 29;
  if (w > maxKg) return `Поштомат приймає до ${maxKg} кг`;
  const cellCm = [cell?.width, cell?.height, cell?.length].filter((n): n is number => typeof n === 'number' && n > 0).map(n => n / 10);
  if (cellCm.length === 3) {
    const box = [l, wd, h].sort((a, b) => b - a);
    const c = cellCm.sort((a, b) => b - a);
    if (box.some((s, i) => s > c[i])) return `Не влізе в комірку поштомата ${c.map(n => Math.round(n)).join('×')} см`;
  }
  return null;
}

export type EpicentrShipmentSender = {
  lastName: string; name: string; middleName?: string; phone: string;
  settlementId: string; officeId: string;
};

/** Тіло POST /v3/oms/orders/{id}/shipping/{provider} (OrderCreateShipmentModelV3). */
export function buildEpicentrShipmentBody(input: {
  sender: EpicentrShipmentSender;
  seat: MeestSeat;
  declared: number;
  description?: string;
}) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const s = input.sender;
  return {
    sender: {
      name: s.name, lastName: s.lastName, ...(s.middleName ? { middleName: s.middleName } : {}),
      settlementId: s.settlementId, officeId: s.officeId, phone: s.phone, provider: 'meest' as const,
    },
    items: [{
      width: r2(input.seat.widthCm), height: r2(input.seat.heightCm), length: r2(input.seat.lengthCm),
      weight: r2(input.seat.weightKg), insuredValue: r2(Math.max(0, input.declared)),
    }],
    deliveryPayer: 'merchant' as const,   // доставка в точки Епіцентру — за рахунок продавця
    isPostPayment: false,                  // покупець оплатив онлайн; післяплати ці точки не мають
    ...(input.description ? { description: input.description.slice(0, 250) } : {}),
  };
}
