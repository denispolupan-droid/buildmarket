// QR-код для оплати рахунку за Правилами НБУ (постанова №97 від 19.08.2025,
// чинна з 01.11.2025), версія формату 002 — її розпізнають застосунки всіх банків.
//
// Структура (додаток 3, табл. 2), рядки через Lf, кодування UTF-8 («1»):
//   BCD · 002 · 1 · UCT · BIC(порожньо) · Отримувач(≤140) · IBAN(29) ·
//   Сума «UAH1275.5»(опц.) · Код отримувача(≤10) · Ціль(порожньо) ·
//   Reference(порожньо) · Призначення(≤420) · Дисплей(порожньо)
// Гіперпосилання = «https://bank.gov.ua/qr/» + Base64URL(структура), ≤507 байт даних.
//
// Графіка (додаток 1): версія QR 10–17 для формату 002, корекція помилок Q або M (беремо M)
// (L — заборонено, бо в центрі обов'язковий знак ₴ у білому колі), діаметр кола
// залежить від версії QR. Модуль на папері — не менше 0,5 мм.
// Текст призначення в QR має збігатися з текстом у самому рахунку (п. 16).

import QRCode from 'qrcode';

const APP_START = 'https://bank.gov.ua/qr/';
const MAX_DATA_BYTES = 507;

export type NbuQrInput = {
  recipient: string;
  iban: string;
  /** Сума в гривнях; null — платник введе сам. */
  amount: number | null;
  recipientCode: string;
  purpose: string;
};

/** Сума за правилами: «UAH3», а не «UAH3.00»; копійки — завжди дві цифри. */
export function formatNbuAmount(amount: number): string {
  const kop = Math.round(amount * 100);
  const int = Math.floor(kop / 100);
  const frac = kop % 100;
  return frac === 0 ? `UAH${int}` : `UAH${int}.${String(frac).padStart(2, '0')}`;
}

export function buildNbuQrPayload(input: NbuQrInput): string {
  const lines = [
    'BCD',
    '002',
    '1',
    'UCT',
    '',
    input.recipient.trim().slice(0, 140),
    input.iban.replace(/\s/g, ''),
    input.amount != null && input.amount > 0 ? formatNbuAmount(input.amount) : '',
    input.recipientCode.replace(/\s/g, '').slice(0, 10),
    '',
    '',
    input.purpose.trim().slice(0, 420),
    '',
  ];
  const payload = lines.join('\n');
  if (Buffer.byteLength(payload, 'utf8') > MAX_DATA_BYTES) {
    throw new Error('NBU QR: дані перевищують 507 байт');
  }
  return payload;
}

export function buildNbuQrUrl(input: NbuQrInput): string {
  return APP_START + Buffer.from(buildNbuQrPayload(input), 'utf8').toString('base64url');
}

/** Діаметр білого кола під знак ₴, у модулях (додаток 1, п. 11). */
export function nbuCircleModules(version: number): number {
  if (version <= 10) return 17;
  if (version <= 12) return 19;
  if (version === 13) return 21;
  if (version <= 15) return 23;
  return 25;
}

export type NbuQrMatrix = {
  version: number;
  /** Кількість модулів по стороні (без «тихої зони»). */
  size: number;
  /** dark[row][col] */
  dark: boolean[][];
  /** Діаметр кола під ₴, у модулях. */
  circle: number;
};

/**
 * Матриця QR найменшої дозволеної версії (від 10) з корекцією M: вона дозволена
 * Правилами разом зі знаком ₴ і дає на 3 версії менший код, ніж Q (для типового
 * рахунку — 13 замість 16), тож QR компактніший у шапці рахунку. Коло під ₴
 * займає ~7 % площі — у межах ~15 % відновлення рівня M.
 */
export function buildNbuQrMatrix(url: string): NbuQrMatrix {
  for (let version = 10; version <= 17; version++) {
    try {
      const qr = QRCode.create(url, { errorCorrectionLevel: 'M', version });
      const size = qr.modules.size;
      const dark = Array.from({ length: size }, (_, r) =>
        Array.from({ length: size }, (_, c) => !!qr.modules.get(r, c)));
      return { version, size, dark, circle: nbuCircleModules(version) };
    } catch {
      // дані не влазять у цю версію — пробуємо більшу
    }
  }
  throw new Error('NBU QR: дані не вміщаються у версію 17');
}

/** SVG для екрана: модулі + біле коло зі знаком ₴ у центрі, з «тихою зоною» 4 модулі. */
export function nbuQrSvg(m: NbuQrMatrix): string {
  const quiet = 4;
  const total = m.size + quiet * 2;
  let path = '';
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (m.dark[r][c]) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  const mid = total / 2;
  const rCircle = m.circle / 2;
  const glyph = (m.circle - 4) * 0.95; // знак вписаний у коло на 4 модулі менше
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR-код для оплати">`
    + `<rect width="${total}" height="${total}" fill="#fff"/>`
    + `<path d="${path}" fill="#000"/>`
    + `<circle cx="${mid}" cy="${mid}" r="${rCircle}" fill="#fff"/>`
    + `<text x="${mid}" y="${mid}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${glyph}" text-anchor="middle" dominant-baseline="central" fill="#000">₴</text>`
    + `</svg>`;
}
