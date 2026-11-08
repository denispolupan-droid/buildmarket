<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project conventions (делать правильно з першого разу)

Ці правила існують, щоб не з'являлися дірки безпеки/продуктивності/SEO. CI (`.github/workflows/test.yml`) гейтить `tsc`, `eslint`, unit-тести і `next build`.

**Авторизація роутів.** Кожен новий API-роут перевіряє права через `lib/auth-guard`:
`requireStaff('admin'[, 'manager'])` для `/api/admin/*`, `requireCustomer('dropship'|'wholesale')` для кабінету. Ніколи не роби ad-hoc `getUser()` + перевірку ролі вручну. Приклад: `app/api/cabinet/products/route.ts`.

**Обробники роутів і логи.** Кожен обробник `app/api/**/route.ts` експортується через `withApi('<шлях>', _GET)` з `lib/api-handler` (request-id, лог необробленої помилки, алерт, відповідь 500 з `rid`); прямий `export async function GET` ловить архітектурний тест. Логи — `log.info/warn/error('domain.event', { … })` з `lib/log` (один рядок JSON з `rid`), не `console.log` з довільним текстом. Алерти адміну — лише `alertAdmin` (`lib/alert`, Telegram з тротлінгом); окремих каналів (email тощо) не заводити.

**Читання даних.** Будь-яка вибірка списку — через `fetchAllRows` (`lib/db-paginate`) або з явним `.limit()`. Без цього PostgREST мовчки обрізає на 1000 рядків. Будь-який `.range()` — ТІЛЬКИ з `.order(<унікальна колонка>)` перед ним (зазвичай `.order('id')`): без ORDER BY сторінки віддаються в нестабільному порядку, рядки дублюються й губляться. Вибирай тільки потрібні колонки (`select('a, b')`, не `select('*')`).

**Статус замовлення.** Ніколи не пиши `orders.status` напряму. Лише `transitionOrder(...)` або `buildStatusPatch(...)` з `lib/orders/status` (мітки часу, `status_history` з джерелом `via`, правила переходів). Нові статуси/переходи — туди ж + `docs/ORDER-LIFECYCLE.md`. Крон/вебхук перед `delivered` перевіряє `allOrderSalesPosted`.

**Гроші.** Ціни/суми ЗАВЖДИ перераховуються на сервері з БД; ціні від клієнта не довіряй. Логіку виноси в чисту функцію і покрий тестом (`lib/pricing.ts`, `lib/mono-signature.ts`).

**Прогноз прибутку.** Факт прибутку — лише леджер (`lib/accounting/profit-rules`). Оцінка валового прибутку по ще не вручених замовленнях («Огляд», «Аналітика», картки) — лише `loadProfitEstimates` з `lib/accounting/estimate`: закупівля з `product_stock`, комісія через `estimateChannelCommissionPerItem` (`lib/marketplace/fees`), факт із леджера має пріоритет. Своя формула «закупівля × qty + ставка категорії» в екрані — нова копія, яка розійдеться з леджером (інцидент 04.11); `price_cost`/`_commission_pct` в `app/admin/finance` ловить архітектурний тест. Дрейф прогнозу проти факту за 30 днів перевіряє крон `check-invariants`.

**Єдині джерела правди** (не копіпасть): `lib/site.ts` (`SITE_URL`, `WHOLESALE_MIN`), `lib/company.ts` (`SELLER` — реквізити), `lib/number-to-words.ts` (сума прописом), `lib/channels.ts` (канали продажу: коди, підписи, кольори — нових мап `CHANNEL_LABELS` в екранах не заводити).

**Рендер / SEO.** Не читай request-time API (`headers()`, `cookies()`, `searchParams`) у server-компонентах, які мають кешуватися — це відключає ISR. Персональні дані (ціни за тарифом) НІКОЛИ не попадають у спільний кеш — тільки на клієнт/edge. `openGraph.type` — лише валідні значення (`website`/`article`).

**БД.** Зміни схеми — тільки через міграційні файли `supabase/migrations/`; після застосування на prod негайно синкай test. Не використовуй raw SQL для prod-схеми.

**Ціни МП: наценка й акції** (міграція 147, `lib/price-adjustments*`). Постійна ціна Rozetka/Prom — лише з наценки через `lib/marketplace-pricing`. Акції й зміни «до дати» — рядки `price_adjustments`, множник `adjustFactor` з `loadFactorMap`; новий екран чи фід без множника покаже ціну, якої немає на площадці. Для акції у фід іде й стара ціна (формула без акційного множника). Записи журналу з `adjustment = true` — не акції сайту: будь-який запит до `price_change_log` по `is_promo` для цін сайту фільтруй `.eq('adjustment', false)`.

**Маркетплейси.** Імпорт замовлення площадки — лише через `importMarketplaceOrder` + адаптер (`lib/marketplace/<code>.ts`, контракт `MarketplaceAdapter`); збори й комісії для обліку — лише через `lib/marketplace/fees` (`lib/accounting` не імпортує `prom-api`/`rozetka-*`/`epicentr-*` — це ловить архітектурний тест). Нова площадка = адаптер + міграція з колонками `<code>_order_id`/`<code>_data`, без правок у синках і обліку.

**Перевізники.** Рух посилок — лише через `DeliveryProvider` (`lib/delivery`): провайдер на перевізника в `lib/delivery/providers/<code>.ts` (`handles(delivery_type)`, пакетний `track()` → `ParcelUpdate`), реєстр у `lib/delivery/registry.ts`, один конвеєр `lib/delivery/sync.ts` (текст → «прийнято» → «прибула» → вручення: РН за ЕН, витрати, «Доставлено» з подіями outbox). Новий перевізник = провайдер + рядок у реєстрі; гілок «якщо delivery_type === …» у синку не додавати. Хто що вміє без API (Укрпошта/Meest) — `lib/carriers`. План: `docs/DELIVERY-PROVIDER.md`.

**Рядки замовлення.** Позиції пишуться лише через `lib/orders/lines` (етап C, міграція 160): нове замовлення — `...newOrderLines(lines)` в insert; зміна позицій — `setOrderLines(db, id, lines, patch)` (SQL `order_set_lines`: рядки `order_lines`, похідний jsonb `items`, інші колонки — одним записом). `orders.total_price` ставить тригер БД з рядків — суму в код не передавати, знижки (ручна, промокод) живуть у `price`/`price_base` рядка. Прямий `.update({ items… })` чи insert з `items` без `newOrderLines` ловить архітектурний тест. У `order_lines` напряму не писати; читати — через `lib/orders/lines-read`. Розходження ловлять інваріанти I9/I10. План: `docs/ORDER-LINES-PLAN.md`.

**Секрети інтеграцій.** Токени, паролі, ключі API (список `SECRET_KEYS` у `lib/secrets`) живуть у Supabase Vault (міграція 150), не в `app_settings`. Читати/писати лише через `readSetting`/`writeSetting`/`deleteSetting` з `lib/secrets` — вони самі роутять секретні ключі у Vault, решту в `app_settings`. Новий токен — додай ключ у `SECRET_KEYS`. Пряме `.from('app_settings')…eq('key', '<секрет>')` ловить архітектурний тест.

**Outbox подій.** Побічні ефекти після зміни замовлення (пуш ЕН/статусу на площадку, сповіщення покупцю) — не «вистрілив і забув» з роуту, а подія через `transitionOrder(db, id, to, actor, via, extra, events)` або `applyOrderPatch(db, id, patch, events)` (збирачі — `lib/outbox/enqueue`), яку доставляє крон `outbox-sweep` з повторами. Виклики `setProm*/setRozetka*/setEpicentr*` з `app/api/admin/orders/**` ловить архітектурний тест (винятки — ручні кнопки `push-*-ttn`). У `outbox_events` з коду не писати напряму — лише `order_transition_outbox`/`outbox_claim` і `lib/outbox/sweeper` (статус рядка, `retryOutboxEvent`). Нові обробники — у `lib/outbox/handlers`, ідемпотентні, зі звіркою стану замовлення перед викликом. Інваріант I13 (`check-invariants`): pending > 30 хв, failed за добу, sweep > 5 хв. План і фази: `docs/OUTBOX-PLAN.md`.

**Безпека вводу.** Екрануй користувацький текст перед вставкою в HTML/`document.write`/JSON у `<script>`. Fetch за користувацьким URL — через `assertPublicUrl` (`lib/safe-fetch-url`).

**UI-регресії.** Правки, які видно тільки в браузері (скрол, ховер, лейаут), перевіряй через
Playwright: `npm run test:e2e` (`tests/e2e/`, спеки ганяються проти `npm run dev`). Потрібен
оптовий акаунт у `.env.local` — `E2E_WHOLESALE_EMAIL` / `E2E_WHOLESALE_PASSWORD`, бо `/catalog`
під авторизацією; сесія кешується в `tests/e2e/.auth/` (у гіт не йде). У CI поки не гейтиться.

**Перед мержем:** `tsc` без помилок, `eslint` без errors, тести зелені, `next build` проходить (усе це гейтить CI).
