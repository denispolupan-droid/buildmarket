// Сума прописом (українською) для рахунків і видаткових накладних.
// Раніше ця функція була скопійована ~8 разів по різних файлах-генераторах документів
// (і копії вже почали розходитися). Єдина реалізація — тут.
//
// Повертає рядок виду "Одна тисяча двісті гривень 50 копійок" (перша літера велика).

export function hryvniaInWords(n: number): string {
  const ones = ['', 'одна', 'дві', 'три', 'чотири', "п'ять", 'шість', 'сім', 'вісім', "дев'ять",
    'десять', 'одинадцять', 'дванадцять', 'тринадцять', 'чотирнадцять', "п'ятнадцять",
    'шістнадцять', 'сімнадцять', 'вісімнадцять', "дев'ятнадцять"];
  const tens = ['', '', 'двадцять', 'тридцять', 'сорок', "п'ятдесят", 'шістдесят', 'сімдесят', 'вісімдесят', "дев'яносто"];
  const hundreds = ['', 'сто', 'двісті', 'триста', 'чотириста', "п'ятсот", 'шістсот', 'сімсот', 'вісімсот', "дев'ятсот"];

  function chunk(x: number): string {
    if (x === 0) return '';
    const parts: string[] = [];
    if (Math.floor(x / 100) > 0) parts.push(hundreds[Math.floor(x / 100)]);
    const rem = x % 100;
    if (rem >= 20) {
      parts.push(tens[Math.floor(rem / 10)]);
      if (rem % 10 > 0) parts.push(ones[rem % 10]);
    } else if (rem > 0) {
      parts.push(ones[rem]);
    }
    return parts.join(' ');
  }

  const intPart = Math.floor(n);
  const kopPart = Math.round((n - intPart) * 100);
  const millions = Math.floor(intPart / 1_000_000);
  const thous    = Math.floor((intPart % 1_000_000) / 1_000);
  const rem      = intPart % 1_000;

  function declThousands(x: number) {
    if (x % 100 >= 11 && x % 100 <= 19) return 'тисяч';
    if (x % 10 === 1) return 'тисяча';
    if (x % 10 >= 2 && x % 10 <= 4) return 'тисячі';
    return 'тисяч';
  }

  const parts: string[] = [];
  if (millions > 0) parts.push(chunk(millions) + ' мільйонів');
  if (thous > 0)    parts.push(chunk(thous) + ' ' + declThousands(thous));
  if (rem > 0 || intPart === 0) parts.push(chunk(rem || 0));

  const gryvn = parts.join(' ').trim();
  const r = intPart % 100;
  const gryvDecl = (r >= 11 && r <= 19) ? 'гривень'
    : (intPart % 10 === 1) ? 'гривня'
    : (intPart % 10 >= 2 && intPart % 10 <= 4) ? 'гривні'
    : 'гривень';

  const first = gryvn.charAt(0).toUpperCase() + gryvn.slice(1);
  return `${first} ${gryvDecl} ${String(kopPart).padStart(2, '0')} копійок`;
}
