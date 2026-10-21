// Єдине джерело правди для реквізитів продавця (ФОП) у документах:
// рахунок-фактура, видаткова накладна, email-повідомлення.
//
// Раніше кожен рендерер читав process.env.BANK_* окремо, а маршрут /vydatkova
// узагалі брав інші змінні (COMPANY_ADDRESS/COMPANY_PHONE) і не показував IBAN —
// через що та сама видаткова накладна друкувалася з різними реквізитами залежно
// від екрана. Тепер усі документи беруть значення звідси.
//
// Значення читаються з env; fallback — фактичні реквізити компанії,
// щоб документ був коректним навіть якщо змінна не задана.

// Env-значення інколи вставляють у Vercel разом із невидимими символами
// (BOM U+FEFF / zero-width пробіли / nbsp) — вони протікають у документ, і,
// наприклад, ЄДРПОУ рендериться як "<невидимий>3198107136". Прибираємо саме ці
// код-поінти (звичайні пробіли НЕ чіпаємо — інакше злиплась би назва банку).
const INVISIBLE = new Set([0xfeff, 0x200b, 0x200c, 0x200d, 0x2060, 0x00a0]);
const clean = (s: string | undefined, fallback: string): string =>
  [...(s ?? fallback)].filter(ch => !INVISIBLE.has(ch.charCodeAt(0))).join('').trim();

export const SELLER = {
  name:      clean(process.env.BANK_RECIPIENT, 'ФОП Полупан Денис Олександрович'),
  edrpou:    clean(process.env.BANK_EDRPOU,    '3198107136'),
  address:   clean(process.env.BANK_ADDRESS,   ''),
  // Місце складання первинних документів (вимога до реквізитів накладної)
  city:      clean(process.env.SELLER_CITY,    'м. Харків'),
  // IBAN 322001… — це АТ «Універсал Банк» (Monobank), не ПриватБанк
  bank:      clean(process.env.BANK_NAME,      'АТ УНІВЕРСАЛ БАНК (Monobank)'),
  iban:      clean(process.env.BANK_IBAN,      'UA803220010000026000370117963'),
  signatory: clean(process.env.SIGNATORY_NAME, ''),
} as const;

// Податковий статус продавця для первинних документів — за датою документа:
// з 01.10.2026 ФОП на 2 групі єдиного податку, до того — 3 група. В обох
// випадках не платник ПДВ.
export function sellerTaxStatus(docDate: string): string {
  const group = docDate.slice(0, 10) >= '2026-10-01' ? 2 : 3;
  return `Платник єдиного податку ${group} групи, не є платником ПДВ`;
}

// Підписант продавця у видатковій: «ФОП» + ПІБ. SIGNATORY_NAME у проді
// порожній, тому ПІБ за замовчуванням виводиться з назви ФОП.
export const SELLER_SIGNER = {
  position: 'ФОП',
  name: SELLER.signatory || SELLER.name.replace(/^ФОП\s+/, ''),
};
