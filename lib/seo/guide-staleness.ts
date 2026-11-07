import type { CategoryAuditRow } from './category-audit';
import { escTg } from '../telegram';

/**
 * Тижнева зведення в Telegram «які тексти категорій застаріли» (07.11.2026).
 *
 * Перелік брендів {brands}, «у наявності» {top:N}, ціни й посилання на товари
 * гайд оновлює сам. Пояснювальний текст («Lacrysil «60 секунд» майже не
 * розширюється…») сам не оновиш — твердження про конкретний товар не можна
 * механічно перенести на інший. Тому раз на тиждень:
 *  - гайд: бренди/товари, яких уже немає; бренди й нові товари без згадки;
 *  - опис категорії («Про категорію», seoText): бренди з переліку «У каталозі
 *    FIXLINE …», яких уже немає, помітні бренди без згадки, названі моделі,
 *    зняті з продажу.
 * Переписати — у редакторі категорії («Згенерувати» або вручну).
 */

/** Ліміт Telegram — 4096 символів; беремо із запасом під хвіст «…ще N». */
const MAX_LEN = 3800;

const textStale = (r: CategoryAuditRow) => r.gaps.guideStale || r.staleBrands.length > 0 || r.seoGoneProducts.length > 0;
const textMissing = (r: CategoryAuditRow) => r.gaps.guideMissing || r.missingBrands.length > 0;

export function guideStalenessRows(rows: CategoryAuditRow[]): CategoryAuditRow[] {
  return rows.filter(r => textStale(r) || textMissing(r));
}

export function buildGuideStalenessMessage(rows: CategoryAuditRow[], siteUrl: string): string | null {
  // Спершу застарілі (текст обіцяє те, чого немає), далі — що не згадано
  const list = guideStalenessRows(rows).sort((a, b) => Number(textStale(b)) - Number(textStale(a)));
  if (!list.length) return null;

  const head = `<b>📚 Тексти категорій: що оновити</b>\nЗастарілих: <b>${list.filter(textStale).length}</b> · без нового асортименту: <b>${list.filter(r => !textStale(r)).length}</b>`;
  const blocks: string[] = [];
  for (const r of list) {
    const lines = [`\n<a href="${siteUrl}/admin/seo/categories/${encodeURIComponent(r.slug)}">${escTg(r.name)}</a>`];
    // Гайд «Як вибрати»
    if (r.guideStaleBrands.length) lines.push(`⛔ гайд: бренду вже немає — ${escTg(r.guideStaleBrands.join(', '))}`);
    if (r.guideDeadLinks.length) lines.push(`⛔ гайд: знято з продажу — ${escTg(r.guideDeadLinks.map(l => l.label).join(', '))}`);
    if (r.guideMissingBrands.length) lines.push(`➕ гайд: бренди без згадки — ${escTg(r.guideMissingBrands.map(b => `${b.brand} (${b.count})`).join(', '))}`);
    if (r.newProducts.length) {
      const names = r.newProducts.slice(0, 5).map(p => p.name).join('; ');
      lines.push(`🆕 гайд: нові товари без згадки — ${escTg(names)}${r.newProducts.length > 5 ? ` … ще ${r.newProducts.length - 5}` : ''}`);
    }
    // Опис категорії («Про категорію»)
    if (r.staleBrands.length) lines.push(`⛔ опис: бренду вже немає — ${escTg(r.staleBrands.join(', '))}`);
    if (r.seoGoneProducts.length) lines.push(`⛔ опис: знято з продажу — ${escTg(r.seoGoneProducts.join(', '))}`);
    if (r.missingBrands.length) {
      lines.push(`➕ опис: бренди без згадки — ${escTg(r.missingBrands.map(b => `${b} (${r.actualBrands.find(a => a.brand === b)?.count ?? 0})`).join(', '))}`);
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
  out += '\n\nОновити — у редакторі категорії («Згенерувати» або вручну).';
  return out;
}
