/** Чисті правила імпорту реєстрів з пошти (для тестів): класифікація листа, посилання на файл. */

export type MailKind = 'np-register' | 'rzpay-register' | 'rzpay-act' | 'other';

/** Що це за лист — за відправником і темою. */
export function classifyRegisterMail(from: string, subject: string): { source: 'novapay' | 'rozetkapay' | null; kind: MailKind; registerNo: string | null } {
  const f = from.toLowerCase();
  if (/novapay\.ua$/.test(f) && /Реєстр платежів контрагента/i.test(subject)) {
    return { source: 'novapay', kind: 'np-register', registerNo: (subject.match(/№\s*(\d+)/) ?? [])[1] ?? null };
  }
  if (/rozetkapay\.com$/.test(f)) {
    if (/^Реєстр платежів/i.test(subject)) return { source: 'rozetkapay', kind: 'rzpay-register', registerNo: (subject.match(/(\d{4}-\d{2}-\d{2})/) ?? [])[1] ?? null };
    if (/Взаєморозрахунки/i.test(subject)) return { source: 'rozetkapay', kind: 'rzpay-act', registerNo: null };
    return { source: 'rozetkapay', kind: 'other', registerNo: null };
  }
  return { source: null, kind: 'other', registerNo: null };
}

/** Посилання на XLSX реєстру з листа RozetkaPay (HTML). */
export function extractRzPayRegisterLink(html: string): string | null {
  const m = /href="(https:\/\/storage\.googleapis\.com\/[^"]+\.xlsx[^"]*)"/i.exec(html);
  return m ? m[1].replace(/&amp;/g, '&') : null;
}
