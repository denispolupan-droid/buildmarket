import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';

/**
 * Розділювальні лінії в картках «Клієнт» і «Доставка» мають стояти на одній висоті.
 *
 * Раніше це трималося на спільному `min-height` нижніх блоків: щойно вміст одного
 * переростав це число (додали рядок про спосіб оплати, з'явилася зелена плашка
 * накладної Rozetka з двома кнопками) — лінія їхала, і помітити це можна було лише
 * оком. Тепер картки — підсітки спільної сітки, тож рядок «низ» у них один.
 *
 * Тест бере РЕАЛЬНИЙ globals.css і навмисно робить блоки різної висоти: якщо хтось
 * повернеться до вирівнювання за min-height, різниця вилізе одразу.
 * Авторизація не потрібна — перевіряється правило стилів, а не сторінка.
 */
test.describe('адмінка — низ карток «Клієнт» і «Доставка»', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('розділювачі обох карток на одній висоті при різному вмісті', async ({ page }) => {
    await page.setContent(`
      <div class="oc-info-cards" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:stretch;width:900px">
        <div class="oc-split" style="padding:16px;background:#fff">
          <div class="oc-card-body">
            <div style="height:120px">клієнт: контакти, телефон, мітки</div>
          </div>
          <div class="oc-card-footer" id="footer-left">
            <div style="height:20px">Оплата</div>
            <div style="height:16px">Пром-оплата</div>
            <div style="height:28px">Оплачено 1 552 ₴</div>
          </div>
        </div>
        <div class="oc-split" style="padding:16px;background:#fff">
          <div class="oc-card-body">
            <div style="height:60px">доставка: перевізник і адреса — вміст навмисно нижчий</div>
          </div>
          <div class="oc-card-footer" id="footer-right">
            <div style="height:20px">Накладна Rozetka</div>
            <div style="height:56px">RMP-614673528</div>
            <div style="height:36px">кнопки</div>
          </div>
        </div>
      </div>
    `);
    await page.addStyleTag({ content: readFileSync('app/globals.css', 'utf8') });

    const left  = (await page.locator('#footer-left').boundingBox())!;
    const right = (await page.locator('#footer-right').boundingBox())!;

    // Верхня межа блоку — це і є розділювальна лінія (border-top)
    expect(Math.abs(left.y - right.y)).toBeLessThanOrEqual(1);
  });
});
