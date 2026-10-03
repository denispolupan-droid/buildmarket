import { escTg } from './telegram';

/**
 * Типи й рендер ранкового дайджесту (чисто, під тести). Збір даних і модель —
 * lib/ops-digest.ts.
 */

export type DigestLevel = 'red' | 'yellow' | 'green' | 'info';

export type DigestSignal = {
  key: string;
  title: string;
  level: DigestLevel;
  summary: string;
  items: string[];
};

export type DigestData = { generatedAt: string; dateHuman: string; signals: DigestSignal[] };

export type DigestText = { headline: string; items: { level: DigestLevel; text: string }[] };

const ICON: Record<DigestLevel, string> = { red: '🔴', yellow: '🟡', green: '🟢', info: 'ℹ️' };
const ORDER: DigestLevel[] = ['red', 'yellow', 'green', 'info'];
const TG_LIMIT = 3900; // ліміт Telegram 4096 на повідомлення, запас на теги

/**
 * Текст від моделі → HTML для Telegram. Усе, що написала модель, екранується;
 * теги лише наші. Без моделі — детермінований текст з тих самих сигналів.
 */
export function renderDigestHtml(data: DigestData, text: DigestText | null, adminUrl: string): string {
  const head = `☀️ <b>Ранковий дайджест · ${escTg(data.dateHuman)}</b>`;
  const lines: string[] = [head];

  if (text) {
    lines.push(escTg(text.headline), '');
    const sorted = [...text.items].sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level));
    for (const it of sorted) lines.push(`${ICON[it.level] ?? '•'} ${escTg(it.text)}`);
  } else {
    lines.push('<i>Сводка без моделі — лише перевірки</i>', '');
    const sorted = [...data.signals].sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level));
    for (const s of sorted) {
      lines.push(`${ICON[s.level]} <b>${escTg(s.title)}</b>: ${escTg(s.summary)}`);
      for (const i of s.items.slice(0, 3)) lines.push(`   • ${escTg(i)}`);
    }
  }

  lines.push('', `<a href="${adminUrl}">Журнал</a> · <a href="${adminUrl}/chat?tab=mp">Чати МП</a> · <a href="${adminUrl}/finance">Фінанси</a>`);
  let out = lines.join('\n');
  if (out.length > TG_LIMIT) out = out.slice(0, TG_LIMIT - 1) + '…';
  return out;
}
