import type { CategoryAuditRow } from './category-audit';
import { escTg } from '../telegram';

/**
 * Тижнева зведення в Telegram «які гайди застаріли» (07.11.2026).
 *
 * Перелік брендів {brands}, «у наявності» {top:N}, ціни й посилання на товари
 * гайд оновлює сам. Пояснювальний текст («Lacrysil «60 секунд» майже не
 * розширюється…») сам не оновиш — твердження про конкретний товар не можна
 * механічно перенести на інший. Тому раз на тиждень: які гайди розповідають
 * про те, чого вже немає, і які бренди та нові товари в них не згадані.
 * Переписати — кнопкою «Згенерувати» в редакторі категорії.
 */

/** Ліміт Telegram — 4096 символів; беремо із запасом під хвіст «…ще N». */
const MAX_LEN = 3800;

export function guideStalenessRows(rows: CategoryAuditRow[]): CategoryAuditRow[] {
  return rows.filter(r => r.gaps.guideStale || r.gaps.guideMissing);
}

export function buildGuideStalenessMessage(rows: CategoryAuditRow[], siteUrl: string): string | null {
  const list = guideStalenessRows(rows)
    // Спершу застарілі (текст бреше), далі за попитом/кількістю — як в адмінці
    .sort((a, b) => Number(b.gaps.guideStale) - Number(a.gaps.guideStale));
  if (!list.length) return null;

  const head = `<b>📚 Гайди категорій: що оновити</b>\nЗастарілих: <b>${list.filter(r => r.gaps.guideStale).length}</b> · без нового асортименту: <b>${list.filter(r => !r.gaps.guideStale).length}</b>`;
  const blocks: string[] = [];
  for (const r of list) {
    const lines = [`\n<a href="${siteUrl}/admin/seo/categories/${encodeURIComponent(r.slug)}">${escTg(r.name)}</a>`];
    if (r.guideStaleBrands.length) lines.push(`⛔ бренду вже немає: ${escTg(r.guideStaleBrands.join(', '))}`);
    if (r.guideDeadLinks.length) lines.push(`⛔ знято з продажу: ${escTg(r.guideDeadLinks.map(l => l.label).join(', '))}`);
    if (r.guideMissingBrands.length) lines.push(`➕ бренди без згадки: ${escTg(r.guideMissingBrands.map(b => `${b.brand} (${b.count})`).join(', '))}`);
    if (r.newProducts.length) {
      const names = r.newProducts.slice(0, 5).map(p => p.name).join('; ');
      lines.push(`🆕 нові товари без згадки: ${escTg(names)}${r.newProducts.length > 5 ? ` … ще ${r.newProducts.length - 5}` : ''}`);
    }
    blocks.push(lines.join('\n'));
  }

  let out = head;
  let shown = 0;
  for (const b of blocks) {
    if (out.length + b.length > MAX_LEN) break;
    out += '\n' + b;
    shown++;
  }
  if (shown < blocks.length) out += `\n\n… ще ${blocks.length - shown} — <a href="${siteUrl}/admin/seo/categories">усі в адмінці</a>`;
  out += '\n\nПереписати — «Згенерувати» в редакторі категорії.';
  return out;
}
