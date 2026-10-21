// Підписанти в первинних документах (видаткова накладна).
//
// Посада і ПІБ друкуються ПОРУЧ і ПІД лінією підпису, а не на ній: лінія
// лишається вільною для живого підпису, поруч — «М.П.» з місцем під печатку.
// ПІБ — у формі «Прізвище І. Б.», як прийнято в розшифровці підпису.

export type Signer = { position: string | null; name: string | null };

/** «Похальчук Ігор Дмитрович» → «Похальчук І. Д.»; вже скорочене чи нестандартне — як є. */
export function shortFio(full: string | null | undefined): string {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return parts.join(' ');
  if (parts.slice(1).some(p => p.endsWith('.'))) return parts.join(' ');
  const [last, ...rest] = parts;
  return `${last} ${rest.map(p => `${p[0].toUpperCase()}.`).join(' ')}`;
}
