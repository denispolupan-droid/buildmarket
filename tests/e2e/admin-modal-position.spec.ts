import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';

/**
 * Модалки адмінки мають перекривати ЕКРАН, а не прокручуваний вміст.
 *
 * Регресія 03.08: вікно «Відвантаження» вискакувало десь угорі, обрізане.
 * Причина — не в самій модалці, а в анімації появи сторінки: `.admin-page-enter`
 * тримається fill-mode'ом і лишає на скрол-контейнері `transform: translateY(0)`.
 * Будь-який transform, включно з нульовим, робить елемент containing block для
 * position:fixed усередині — і `inset: 0` починає означати «вся висота вмісту»
 * замість «весь екран».
 *
 * Тест відтворює саме цю структуру з РЕАЛЬНИМ globals.css, тож ловить повернення
 * regression'у навіть якщо анімацію колись перепишуть. Авторизація не потрібна —
 * перевіряється правило стилів, а не сторінка.
 */
test.describe('адмінка — позиція модального вікна', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('fixed-підкладка накриває весь екран, а не прокручуваний вміст', async ({ page }) => {
    await page.setContent(`
      <div class="admin-layout" style="display:flex;height:100vh;overflow:hidden">
        <div class="admin-page-enter" id="scroller" style="flex:1;min-width:0;overflow:auto">
          <div style="height:4000px">довгий вміст сторінки</div>
          <div id="overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center">
            <div id="box" style="background:#fff;width:480px;height:300px">Відвантаження</div>
          </div>
        </div>
      </div>
    `);
    await page.addStyleTag({ content: readFileSync('app/globals.css', 'utf8') });

    // Прокручуємо вглиб — саме тут баг і виявлявся
    await page.locator('#scroller').evaluate(el => { el.scrollTop = 2000; });
    // Анімація появи — 0.22s; чекаємо, поки застигне кінцевий кадр
    await page.waitForTimeout(400);

    const viewport = page.viewportSize()!;
    const overlay = (await page.locator('#overlay').boundingBox())!;

    expect(Math.round(overlay.height), 'підкладка має бути висотою з екран, а не з вміст').toBe(viewport.height);
    expect(Math.round(overlay.y)).toBe(0);

    // Вікно повністю у видимій частині — його не має зрізати ні згори, ні знизу
    const box = (await page.locator('#box').boundingBox())!;
    expect(box.y, 'верх вікна не має бути вище екрана').toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, 'низ вікна не має виходити за екран').toBeLessThanOrEqual(viewport.height);
  });
});
