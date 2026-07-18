// Єдине джерело правди для реквізитів продавця (ФОП) у документах:
// рахунок-фактура, видаткова накладна, email-повідомлення.
//
// Раніше кожен рендерер читав process.env.BANK_* окремо, а маршрут /vydatkova
// узагалі брав інші змінні (COMPANY_ADDRESS/COMPANY_PHONE) і не показував IBAN —
// через що та сама видаткова накладна друкувалася з різними реквізитами залежно
// від екрана. Тепер усі документи беруть значення звідси.
//
// Значення читаються з env; fallback — фактичні реквізити компанії (ПриватБанк),
// щоб документ був коректним навіть якщо змінна не задана.
export const SELLER = {
  name:      process.env.BANK_RECIPIENT ?? 'ФОП Buildmarket',
  edrpou:    process.env.BANK_EDRPOU    ?? '3198107136',
  address:   process.env.BANK_ADDRESS   ?? '',
  bank:      process.env.BANK_NAME      ?? 'АТ «ПриватБанк»',
  iban:      process.env.BANK_IBAN      ?? 'UA803220010000026000370117963',
  signatory: process.env.SIGNATORY_NAME ?? '',
} as const;
