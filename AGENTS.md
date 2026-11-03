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

**Єдині джерела правди** (не копіпасть): `lib/site.ts` (`SITE_URL`, `WHOLESALE_MIN`), `lib/company.ts` (`SELLER` — реквізити), `lib/number-to-words.ts` (сума прописом).

**Рендер / SEO.** Не читай request-time API (`headers()`, `cookies()`, `searchParams`) у server-компонентах, які мають кешуватися — це відключає ISR. Персональні дані (ціни за тарифом) НІКОЛИ не попадають у спільний кеш — тільки на клієнт/edge. `openGraph.type` — лише валідні значення (`website`/`article`).

**БД.** Зміни схеми — тільки через міграційні файли `supabase/migrations/`; після застосування на prod негайно синкай test. Не використовуй raw SQL для prod-схеми.

**Ціни МП: наценка й акції** (міграція 147, `lib/price-adjustments*`). Постійна ціна Rozetka/Prom — лише з наценки через `lib/marketplace-pricing`. Акції й зміни «до дати» — рядки `price_adjustments`, множник `adjustFactor` з `loadFactorMap`; новий екран чи фід без множника покаже ціну, якої немає на площадці. Для акції у фід іде й стара ціна (формула без акційного множника). Записи журналу з `adjustment = true` — не акції сайту: будь-який запит до `price_change_log` по `is_promo` для цін сайту фільтруй `.eq('adjustment', false)`.

**Маркетплейси.** Імпорт замовлення площадки — лише через `importMarketplaceOrder` + адаптер (`lib/marketplace/<code>.ts`, контракт `MarketplaceAdapter`); збори й комісії для обліку — лише через `lib/marketplace/fees` (`lib/accounting` не імпортує `prom-api`/`rozetka-*`/`epicentr-*` — це ловить архітектурний тест). Нова площадка = адаптер + міграція з колонками `<code>_order_id`/`<code>_data`, без правок у синках і обліку.

**Рядки замовлення.** Позиції й далі пишуться в `orders.items` (jsonb). Таблиця `order_lines` — дзеркало, яке веде тригер БД: з коду в неї **не писати** (insert/update/delete), читати можна лише в звітах і лише після етапу B (`docs/ORDER-LINES-PLAN.md`). Розходження ловлять інваріанти I9/I10.

**Секрети інтеграцій.** Токени, паролі, ключі API (список `SECRET_KEYS` у `lib/secrets`) живуть у Supabase Vault (міграція 150), не в `app_settings`. Читати/писати лише через `readSetting`/`writeSetting`/`deleteSetting` з `lib/secrets` — вони самі роутять секретні ключі у Vault, решту в `app_settings`. Новий токен — додай ключ у `SECRET_KEYS`. Пряме `.from('app_settings')…eq('key', '<секрет>')` ловить архітектурний тест.

**Outbox подій.** Побічні ефекти після зміни замовлення (пуш ЕН/статусу на площадку, уведомлення) — не «вистрілив і забув» з роуту, а подія через `transitionOrder(db, id, to, actor, via, extra, events)` (`lib/outbox/enqueue`), яку доставляє крон `outbox-sweep` з повторами. У `outbox_events` з коду не писати напряму — лише `order_transition_outbox`/`outbox_claim` і оновлення статусу рядка в `lib/outbox/sweeper`. Нові обробники — у `lib/outbox/handlers`, ідемпотентні, зі звіркою стану замовлення перед викликом. План і фази: `docs/OUTBOX-PLAN.md`.

**Безпека вводу.** Екрануй користувацький текст перед вставкою в HTML/`document.write`/JSON у `<script>`. Fetch за користувацьким URL — через `assertPublicUrl` (`lib/safe-fetch-url`).

**UI-регресії.** Правки, які видно тільки в браузері (скрол, ховер, лейаут), перевіряй через
Playwright: `npm run test:e2e` (`tests/e2e/`, спеки ганяються проти `npm run dev`). Потрібен
оптовий акаунт у `.env.local` — `E2E_WHOLESALE_EMAIL` / `E2E_WHOLESALE_PASSWORD`, бо `/catalog`
під авторизацією; сесія кешується в `tests/e2e/.auth/` (у гіт не йде). У CI поки не гейтиться.

**Перед мержем:** `tsc` без помилок, `eslint` без errors, тести зелені, `next build` проходить (усе це гейтить CI).
