// Нормалізація телефону до формату, який приймають SMS/Viber-провайдери: 380XXXXXXXXX.
//
// У базі номери лежать у трьох форматах одночасно — «380671234567» з Rozetka,
// «+380671234567» з Prom, «+38 (067) 123-45-67» із сайту. Провайдеру потрібен
// один, і кожна помилка тут — це не косметика, а недоставлене повідомлення про
// посилку, тобто той самий мовчазний збій, з якого починалися всі скарги.

/** 380XXXXXXXXX або null, якщо це не схоже на український мобільний. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;

  // 380671234567 — уже готовий
  if (digits.length === 12 && digits.startsWith('380')) return digits;
  // 0671234567 — національний
  if (digits.length === 10 && digits.startsWith('0')) return `38${digits}`;
  // 671234567 — без нуля (трапляється в ручному вводі)
  if (digits.length === 9) return `380${digits}`;
  // 80671234567 — старий формат із «8»
  if (digits.length === 11 && digits.startsWith('80')) return `3${digits}`;

  return null;
}

/**
 * «050 123 45 67» — як номер читають і диктують люди. Потрібен адмінці: у списку
 * замовлень номери приходять від маркетплейсів у трьох різних написаннях, і око
 * щоразу перечіплялося через «380…» замість звичного нуля.
 * Незнайомий формат повертаємо як є — краще показати сире значення, ніж зіпсуте.
 */
export function phoneLocal(raw: string | null | undefined): string {
  const norm = normalizePhone(raw);
  if (!norm) return String(raw ?? '');
  const d = norm.slice(2);                       // 380XXXXXXXXX → 0XXXXXXXXX
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
}

/** Той самий номер для буфера обміну — без пробілів, щоб вставлявся в пошук і форми. */
export function phoneLocalDigits(raw: string | null | undefined): string {
  const norm = normalizePhone(raw);
  return norm ? norm.slice(2) : String(raw ?? '');
}

/**
 * Ввід номера в форму: те, що людина набрала → національні цифри «0XXXXXXXXX».
 * Приймає будь-яке написання (380…, 38…, +38 (0..), просто 9 цифр) — менеджери
 * і покупці вставляють номер із кабінету МП, з листа, з месенджера.
 */
export function phoneInputDigits(str: string): string {
  const raw = String(str ?? '').replace(/\D/g, '');
  if (raw.startsWith('380')) return raw.slice(2);
  if (raw.startsWith('38'))  return '0' + raw.slice(2);
  if (raw.startsWith('0'))   return raw;
  return raw.length ? '0' + raw : '';
}

/** Ті самі цифри назад у «+38 (050) 671-79-34» — як номер читають люди. */
export function phoneInputFormat(localDigits: string): string {
  const d = String(localDigits ?? '').slice(0, 10);
  if (!d) return '';
  let r = '+38 (' + d.slice(0, Math.min(3, d.length));
  if (d.length <= 3) return r;
  r += ') ' + d.slice(3, Math.min(6, d.length));
  if (d.length <= 6) return r;
  r += '-' + d.slice(6, Math.min(8, d.length));
  if (d.length <= 8) return r;
  return r + '-' + d.slice(8, 10);
}

/** Номер набрано повністю (10 національних цифр)? Порожній рядок — не помилка. */
export function isCompletePhoneInput(str: string): boolean {
  const d = phoneInputDigits(str);
  return d.length === 0 || d.length === 10;
}

/** Чи можемо ми взагалі щось надіслати на цей номер. */
export function isSendablePhone(raw: string | null | undefined): boolean {
  return normalizePhone(raw) !== null;
}
