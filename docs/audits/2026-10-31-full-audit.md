# Комплексный аудит FIXLINE (buildmarket) — 31.10.2026

Срез: рабочее дерево на ветке `feat/returns-journal` (41 коммит позади `origin/main`). Все критичные находки перепроверены против `origin/main` (1881784f, 30.10.2026); там, где ветки расходятся, это указано. Аудит read-only: код, схема БД, миграции, workflow, `npm audit`, плюс два read-only запроса к прод-PostgREST анонимным ключом для подтверждения RLS-утечки. Ничего не менялось.

Объём: Next.js 16.2.10 / React 19 / Supabase (nano) / Vercel. 156 k строк TS/TSX (app 114 k, lib 41 k), 283 route handler, 110 таблиц, 24 триггера, ~55 функций, 154 файла миграций + baseline-снимок, 1 404 unit-кейса, 12 интеграционных сьютов, 13 GitHub-workflow.

---

## 0. Вердикт коротко

**Общая оценка: 6,5 / 10.** Это не «приложение с работающим интерфейсом», а настоящая мини-ERP с правильным учётным ядром (двойная запись, FIFO, сторно, период-lock, ежедневные инварианты, бэкап с тестовым восстановлением). Учётное ядро и домен заказов спроектированы на уровне, который редко встречается в проектах одного владельца. Но вокруг этого ядра — четыре класса проблем, которые не дают назвать систему коммерческим продуктом:

1. **Подтверждённая утечка коммерческих данных через RLS** (себестоимость, дроп/опт-цены, дебиторка с именами клиентов читаются анонимным ключом на проде).
2. **Проведение документа не атомарно** и FIFO использует `SKIP LOCKED` — в редких, но реальных сценариях склад и леджер расходятся молча; плюс два legacy-пути оплаты дают двойную выручку.
3. **Обрывы масштабирования на ~1 000–1 130 SKU** (лимит PostgREST в 12 админ-экранах, 2 МБ кеша каталога, полный каталог в пропсах витрины, `force-dynamic` страница товара).
4. **Технический долг фронтенда и слоя данных**: `AdminOrders.tsx` 6 717 строк, нетипизированный Supabase, нет валидации входа API, три копии синка маркетплейсов, `orders.items` в jsonb.

| Направление | Оценка | Комментарий |
|---|---|---|
| Архитектура | 6 | Домены выделены, ядро чистое; но god-компоненты, нет DAL/типов, нет адаптеров каналов |
| Бизнес-логика / учёт | 7 | Настоящая двойная запись, FIFO, инварианты; минус атомарность и 2 legacy-пути денег |
| База данных | 7 | numeric/timestamptz/FK/append-only/CHECK; минус jsonb-позиции, история миграций, RPO 24 ч |
| Безопасность | 5 | Периметр и auth сильные; но RLS-утечка цен и дебиторки, anon INSERT в orders, секрет крона в git, Next с critical advisory |
| Производительность | 5 | ISR и пагинация там, где чинили; но потолки 1 000/1 130 SKU и нано-база |
| Масштабируемость (×5–10) | 4 | Сегодня сломается первой: кеш каталога, витрина, страница товара, админ-экраны цен |
| UX админки | 5 | Функционально богато; инженерно — один файл на всё, inline-стили, нет a11y, нет группировки |
| Надёжность / эксплуатация | 7 | Инварианты, secdef-guard, бэкап с restore-test, health-check, Telegram-алерты; нет трассировки |
| Тесты / CI | 7 | 1 400 кейсов, интеграция на живой схеме; но интеграция только после мержа, есть тавтологии |

**Можно ли доверять данным?** Леджеру — да: все финансовые экраны читают `money_entries`, не `orders`, инварианты бегут ежедневно. Оценочным экранам (аналитика, экспорт прибыли) — нет: там свои формулы и UTC-границы (§7). Складу — да, при условии закрытия C1/H1 (§2).

---

## 1. Архитектура и стек

**Правильно.** Next 16 App Router + Supabase + Vercel — адекватный стек для одного юрлица с тремя продуктами в монолите (витрина, кабинет партнёра, ERP). `proxy.ts` по новой конвенции, async params, ISR с `generateStaticParams` на листингах, `headers()` из layout убран (пункт июльского аудита закрыт). Домены разнесены: `lib/accounting/*`, `lib/orders/*`, `lib/notify/*`; единые источники правды `lib/site.ts`, `lib/company.ts`, `lib/number-to-words.ts`, `lib/marketplace-pricing.ts`, `lib/orders/status.ts`. На `main` все 218 admin-роутов гейтятся `requireStaff` (на текущей ветке — 88).

**Долг (с подтверждением).**
- `app/admin/AdminOrders.tsx` — 6 717 строк, 118 `useState`, 55 `fetch`, 644 inline-style: список, карточка, редактор позиций, ТТН, реестры, печать в одном клиентском модуле без тестов. Ещё 20 клиентских компонентов > 600 строк (`NewOrderModal` 1 698, `PricesClient` 1 694, `ProductForm` 1 558, `ProcurementDetail` 1 495).
- Supabase нетипизирован: `Database`-generic используется в 1 файле, `types/database.types.ts` отстал от схемы (нет `ttn_snapshot`, `phone_digits`, `name_norm`); 104 модуля создают service-клиент на уровне модуля; `as any` 38, `as unknown as` 43. Комментарий в `lib/supabase.ts:55-60` признаёт: включение типов даёт 161 ошибку в 30 файлах — т.е. 30 файлов уже обращаются к полям, которых нет или которые типизированы иначе.
- Валидации входа API нет как класса: ни zod/valibot; 146 роутов читают `req.json()`, 42 что-то проверяют; 138 из 283 роутов без `catch`.
- Маркетплейсы — три bespoke копии (`lib/prom-sync.ts:185-218`, `lib/rozetka-sync.ts:301-334`, `lib/epicentr-sync.ts:79-99` — идентичный блок «найти клиента → создать → создать заказ»); таблицы `marketplace_orders`, `marketplace_sync_queue`, `webhook_events` спроектированы в миграции 009 и не используются ни одним файлом. Доставка — ветвление `np/rozetka/rzOwn` внутри `lib/delivery-sync.ts`. Ядро учёта импортирует модули каналов (`lib/accounting/completion.ts:19-27`) — двусторонняя связность.
- `orders.items` jsonb как второй источник позиций рядом с `acc_document_lines`; синхронизация `syncSaleDraftLines` (delete+insert) и ежедневная сверка `findSaleDivergences` — это «страховка наблюдением», не гарантия. В `docs/SYSTEM.md:42` переход на `order_lines` уже назван этапом 1.
- `app/ru/` — 22 полные копии страниц (diff `product/[id]/page.tsx` 346 строк из 365); три механизма перевода.
- 957 относительных импортов глубиной до 6 при настроенном алиасе `@/`; 25 локальных копий `fmt()` денег и 12 копий `fmtDate`; два пути создания заказа (`NewOrderModal` и `orders/new`).
- `lib/env.ts` валидирует 3 переменные из ~50; `.env.local.example` — 5 ключей; `README.md` — шаблон create-next-app.

---

## 2. Учёт и бизнес-логика

**Что устроено правильно (не перестраивать).** `record_money_txn` пишет две ноги с общим `txn_id`, I2 проверяет Σ=0, кэш `counterparty_balances` триггером и сверяется I3; `money_entries` и `stock_movements` append-only (триггеры запрещают UPDATE/DELETE), закрытие периода только при зелёных инвариантах; FIFO-партии с `remaining_qty ≥ 0`, `stock_balance` с CHECK и generated `qty_available`, атомарные резервы `FOR UPDATE`; «Вариант 3» (РН-черновик при отгрузке, проводки при вручении) и `inventory_transit` для дропшипа; «Вариант B» стороны долга как чистая функция с тестами; идемпотентные ключи везде, где деньги; единое определение P&L в `profit-rules.ts`; единая статус-машина с историей `via`; 12 интеграционных сьютов гоняют реальные проводки на живой схеме с `check_invariants` после каждого шага.

**Критичные находки.**
- **C1. Проведение документа — цепочка из ~10 REST-вызовов без транзакции.** `lib/accounting/documents.ts:129-235`: `consume_stock_fifo`/`create_stock_batch` вызываются построчно (каждый — своя транзакция), а `stock_movements` вставляются одним bulk-insert *после* цикла (`:181-186`). Сбой на строке №2 (нехватка партий, обрыв сети) оставляет партии по строке №1 списанными без движений; повтор `confirmDocument` видит `existingMoves = 0` и списывает партии второй раз. Инварианта «Σ `stock_batches.remaining_qty` = `stock_balance.qty_total`» нет — дрейф COGS невидим. Все кирпичи (consume_fifo, create_batch, record_money_txn) уже SQL — нужна одна plpgsql-функция `post_document(doc_id, by)`.
- **C2. Двойная выручка через legacy-путь смены `payment_type`.** `app/api/admin/orders/[id]/route.ts:319-350` (`main:343`): для `shipped` заказа без дебетовой проводки пишет `recordShipment` на `total_price` с ключом `shipment:payment-type:{id}` без `doc_id`. Под «Вариантом 3» у `shipped` заказа РН ещё черновик, при вручении `confirmDocument` пишет `shipment:{docId}` ещё раз — `uq_money_entries_sale_shipment` не срабатывает (первый без `doc_id`).
- **H1. `FOR UPDATE SKIP LOCKED` в `consume_stock_fifo`** (`027_stock_batches_fifo.sql:46`, `062_core_integrity.sql:26`, baseline:620). Две одновременные продажи одного SKU: вторая пропускает заблокированную старшую партию и списывает младшую (нарушение FIFO), а если других партий нет — ложное «недостаточно партий». Для FIFO нужен обычный `FOR UPDATE`.
- **H2. `payment_confirmed=true`** (`route.ts:389-438`, `main:432`) пишет `recordCustomerPayment` на полный `total_price` с ключом `payment:confirmed:{id}`, не глядя на частичные оплаты через `applyOrderPayment` → двойной приход.
- **H3.** `lib/accounting/order-payment.ts:131-136` — ошибка записи в леджер проглатывается после того, как `amount_paid` уже обновлён; алерта нет.
- **H4.** Отмена заказа с ≥2 проведёнными РН: `.maybeSingle()` без `reversal_of IS NULL` (`route.ts:496-511`) возвращает null → сторно не делается, алерта нет.

**Средние.** Guard закрытого периода только на `money_entries` (063) — склад, даты документов, `order_payments` после закрытия месяца не защищены; `sale-edit-guard.ts:22` в режиме наблюдения. `fn_track_order_status` пишет `changed_by` из `current_setting('app.current_user')`, который код нигде не ставит — в `order_status_history` автор всегда NULL. `createDebtAdjustment` создаёт документ `confirmed` до проводок. Нет UNIQUE на `acc_documents(doc_type, doc_number)`. `resolveDropshipFallback` в цикле по строкам (`fulfillment.ts:166,193`, N×3 запросов — не исправлено с июля). Тавтологические тесты `tests/payout.test.ts:10-20`, `tests/partner-balance.test.ts:141-149` живы с июля.

**Отсутствующие инварианты** (именно там, где код может разойтись молча): партии = остаток; Σ строк РН = `total_amount` = сумма `shipment:`-проводки; `orders.amount_paid` = Σ `order_payments` = Σ кредитов дебитора; `check_balance_integrity()` партнёрского леджера не включён в ежедневный прогон.

---

## 3. Производительность и масштаб

Июльские P0/P1 по пагинации фидов/финансов, `headers()` в layout, Footer, `images.unoptimized`, `@ts-ignore` — закрыты. Открыто: `force-dynamic` страница товара, N+1 в синках и fulfillment, `auth.getUser()`/`/api/promo` в useEffect.

**Обрывы, которые наступят первыми (порог в скобках).**
1. **Кеш каталога > 2 МБ `unstable_cache` (~1 130 SKU, +45 % к сегодняшним ~770).** `lib/supabase.ts:144-146`: публичная выборка 1,36 МБ на 773 товара. После порога `getProductsCached` молча перестаёт кешироваться, и каждый рендер `/shop/*`, sitemap, `generateStaticParams`, страницы товара идёт в нано-базу за всем каталогом — постоянный режим инцидента 27.10 (PGRST003, 57014).
2. **Полный каталог в RSC-пропсах витрины.** `app/shop/ShopLoader.tsx:30-35` — на `/shop`, `/shop/sale`, бренд-страницах весь каталог с характеристиками едет в HTML, клиент рисует по 24 (`ShopClient.tsx:397`). ~1,4 МБ сейчас, ~14 МБ при 8 000 SKU; фильтры/сортировка на клиенте.
3. **Страница товара `force-dynamic`** (`app/product/[id]/page.tsx:40`, +ru): самая посещаемая страница без CDN-кеша, 7 запросов + `getUser()` на каждый хит; нет `loading.tsx`, карточки листинга префетчат динамический маршрут (`ShopClient.tsx:141` без `prefetch={false}`).
4. **Лимит PostgREST 1 000 строк — уже неверно сегодня:** `app/api/admin/finance/periods/route.ts:38` читает `money_entries` без границ (обороты по месяцам считаются по первым 1 000 проводкам; подтверждено и на `main`); `products/import/route.ts:120` — `product_characteristics` (10,6 тыс. строк). **Обрыв ровно на 1 000 SKU:** `admin/prices/page.tsx:23`, `admin/prom/prices:24`, `admin/prom/products:24`, `admin/rozetka/products:26`, `api/admin/prices/pricelist:161`, `admin/products/page.tsx:36` (`product_stock.select('*')`), `products/export:22`, `products/import:410` (проверка уникальности slug → дубли slug). `range()` без `order()`: `admin/products/page.tsx:51`, `seo/ai/route.ts:61,68`. Потолки: `search-index:24` (2 000), `prom-feed:276` (20 000 характеристик, 20 параллельных запросов в пул нано-базы на каждый запрос краулера, `no-store`), `getBrands` 2 000.
5. **Леджер целиком в JS:** `trial-balance/page.tsx:57` (весь леджер от начала времён), `payables:24`, `overview-data.ts:223`; `admin/page.tsx:166-227` — `orders.select('*')` с 7 jsonb-колонками в RSC-пропсы + три полных прохода по `orders` ради счётчиков статусов/каналов/суммы на каждый показ списка.
6. **Синк поставщика построчно:** `lib/supplier-sync.ts:514,540` — два последовательных upsert на строку прайса (8 000 строк = 16 000 запросов), `fetch` без таймаута (`:245`), без `maxDuration`, без блокировки повторного запуска.
7. **Внешние API без таймаутов:** `np-api`, `prom-api`, `rozetka-api`, `epicentr-api`, `zoho-mail`, `rozetkapay-api`, `rz-delivery-api`, `telegram`, `gsc`, `google-ads` — ни `AbortSignal.timeout`, ни ретраев (на `main` есть `np-retry` для 429, это не таймаут). Кроны `rozetka-orders`/`prom-orders` без advisory-lock — при долгом тике запуски накладываются.
8. `AdminSidebar.tsx:126` каждые 60 с → `/api/admin/mail/unread` → два вызова Zoho API без кеша на каждую открытую вкладку.
9. `ensure-marketplace-sync` роут и RPC (067) живы: один вызов пересоздаст pg_cron-дубли HTTP-синков рядом с Vercel-кронами. У Prom при этом нет unique на `orders.prom_order_id` (есть у Rozetka/Epicentr) и select-then-insert (`prom-sync.ts:98,218`) — окно для дублей.

Индексы: покрытие `orders`/`money_entries`/`stock_*` хорошее; дубли на `product_characteristics(product_sku)` ×3, нет составного `acc_documents(doc_type, status, doc_date)`, две RLS-политики с голым `auth.uid()` (baseline:10159,10168).

---

## 4. База данных и надёжность

**Правильно.** Все деньги `numeric`, все даты `timestamptz`, generated-суммы, 125 FK (включая RESTRICT на удаление заказов с учётом, 129), частичные уникальные индексы на id заказов площадок и `payment_reference`, `uq_money_entries_sale_shipment`, `idx_acc_doc_one_reversal`, CHECK на остатки/резервы/qty/price, RLS на всех 110 таблицах, 72 таблицы deny-by-default. Бэкап: ежедневный `pg_dump` + restore-test в чистый PG17 со сверкой строк + Telegram. `schema-parity`, `secdef-guard`, `accounting-invariants`, `health-check` — ежедневно. Тест-изоляция: prod-guard, DB-lock, `reset_accounting_test_data` отказывает при реальных данных (это спасло прод 21.10).

**Находки.**
- **CRON_SECRET в открытом виде в git и в теле функции прода.** `supabase/migrations/020:11`, `066:18,32`, `067:21`, `069:13`, `baseline-2026-10-03.sql:1820`. Проверено: значение совпадает с текущим `CRON_SECRET` в `.env.local`. Любой с доступом к репо дёргает все 22 `/api/cron/*` (синки, выписки, проведение продаж по вручению). **Ротировать немедленно**, токен — в `vault`/`app_settings`, не в DDL.
- Миграции не воспроизводят схему с нуля (признано в `supabase/schema/README.md`): 17 дублей номеров, 087 «снято с живого прода», `test-sync-2026-10-15.sql`; нет `supabase/config.toml`, нет down-миграций; `apply-accounting-migrations.mjs` — устаревший список из 8 файлов. Baseline-снимок — честный выход, но `schema-parity.yml` сравнивает только колонки, не функции/триггеры/политики — именно там жил `fn_partner_txn_to_ledger`, двоивший проводки (121).
- Бэкап: RPO 24 ч, только `public` (без `auth.users` → при восстановлении пропадут логины и `customers.auth_user_id`), ретенция 30 дней в GitHub Artifacts того же аккаунта, нет off-site копии и процедуры восстановления в проект Supabase. Для учётной системы — слабо.
- `orders` — 90+ колонок без `updated_at`, с полями трёх площадок и сырыми payload-jsonb; `status_history` jsonb рядом с таблицей `order_status_history`; три копии ТТН. `money_entries.counterparty_id text` кодирует три сущности (`uuid`, `np:cod`, `mp:*`). Два кэша балансов (`counterparty_balances` и `customers.balance`) без общего инварианта.
- Нет структурированного логирования, request-id, трассировки; `lib/monitoring.ts` шлёт email через Resend параллельно Telegram-алертам.
- Ретенция ПДн: `abandoned_carts` и raw payload площадок бессрочно; процедуры удаления данных клиента нет.

---

## 5. Безопасность

**Подтверждено на проде (read-only GET с anon-ключом из `.env.local`, 31.10):**
```
GET /rest/v1/product_stock?select=sku,price_cost,price_drop,price_wholesale,supplier_sku  → 200, данные
GET /rest/v1/products?select=sku,min_price,supplier_sku                                   → 200, данные
GET /rest/v1/ar_aging?select=*     → 200: customer_name, contract_id, суммы долга
GET /rest/v1/ar_balances?select=*  → 200: то же
GET orders / money_entries / customers / counterparty_balances                            → 200, [] (закрыто)
```
- **Critical-1.** `product_stock_public_read USING (true)` (baseline:10261) при колонках `price_cost`, `price_drop`, `price_wholesale`, `supplier_sku`; `products_public_read` (:10274) отдаёт `supplier_sku`, `purchase_ratio`, `*_markup_pct`. Column-level REVOKE нет. Клиент реально так читает: `app/account/wishlist/GuestWishlistPage.tsx:25`, `app/account/wishlist/page.tsx:29` (`stock:product_stock(*)`). Серверный allowlist `lib/public-product.ts` показывает, что авторы риск понимали, но закрыли только серверный путь. Это закупочные и партнёрские цены всего каталога для конкурентов.
- **Critical-2.** Views `ar_aging`, `ar_balances` пересозданы миграциями 110/112 без `security_invoker` и без REVOKE (baseline:2607,2673) — дебиторка с именами клиентов открыта анонимно.
- **Critical-3.** `CRON_SECRET` в git (см. §4).
- **Critical-4.** `next@16.2.10`: `npm audit` — critical (диапазон ≤16.4.0, fix 16.4.3): proxy bypass, DoS/SSRF Server Actions, advisories Image Optimization/og. Плюс high: `sharp` (libvips CVE, обрабатывает загрузки), `undici`, `postcss`; `xlsx@0.18.5` — high без фикса, парсит файлы партнёров (`cabinet/orders/parse`), письма (`mail-registers`), реестры, прайсы — пункт P1 июля не закрыт.
- **High.** Политики `Allow guest order inserts` (anon, `user_id IS NULL`) и INSERT для `authenticated` на `orders` (baseline:9540) при том, что чекаут идёт через service-role (`app/api/orders/route.ts:46`) — прямой INSERT заказов в обход цен, rate-limit и Telegram-уведомлений. Удалить.
- **Medium.** Реестры выплат проводятся в учёт по письмам, классифицируемым только по `From` (`lib/mail-registers-rules.ts:6-7`) — спуфинг → ложные проводки; нужна проверка DKIM/`Authentication-Results`. Самостоятельная регистрация как `dealer/contractor/shop_owner/dropship` без модерации даёт опт/дроп-цены (`app/register/page.tsx:109`, триггер 055, `sync-partner:43`). 35 из 91 страниц `/admin/*` без собственного page-гейта — менеджер видит финансы/партнёров/настройки (layout пускает `admin|manager`). `DigestClient.tsx:78` рендерит ИИ-HTML через `dangerouslySetInnerHTML` — prompt-injection из чатов покупателей → XSS у админа. Токены интеграций открытым текстом в `app_settings`. Публичные `invoice/[id]/pdf`, `vidatkova/[id]/pdf` по UUID без отзыва. `proxy.ts` не гейтит `/api/admin/*` (defense-in-depth).
- **Low.** `novaposhta` `_apiKeyOverride` — анонимный relay; `promo-image` без лимита/проверки типа; `rozetka/feed` без секрета; in-memory rate-limit ×2; CSP `'unsafe-inline'`; `===` вместо constant-time для `revalidate`/`mono-statement`/`telegram`; `auth/signout` по GET.

**Сделано правильно.** Роль только в `app_metadata`, триггер 055 + revoke 059, `secdef-guard` как регресс-тест; `cronAuthorized` closed-by-default с `timingSafeEqual`; Monobank ECDSA по raw body с трёхуровневой идемпотентностью; `escapeOrTerm` для всех PostgREST-фильтров; JSON-LD с `<`; blog через `sanitize-html` с allowlist; `assertPublicUrl`; `.env` вне git, service-role не в клиентских бандлах, `getUser()` везде; security headers + HSTS preload. Июльские P0 (`cabinet/products`), open redirect, stored XSS в `PricesClient`, NP-прокси — закрыты.

---

## 6. UX

Функционально админка богаче типового магазина: серверная пагинация и фильтры в URL в журнале заказов, массовые действия, реестры, печать, bank reconciliation, aging, ОСВ, акт сверки, двухстадийные возвраты, landed cost, план/факт, ABC, утренний дайджест. Это уровень Zoho Inventory/Books по покрытию операций.

Инженерно: 19 пунктов плоского сайдбара без группировки и без глобального поиска; `AdminOrders.tsx` как один экран на всё; 6 857 inline-стилей и 300+ хардкод-цветов в `app/admin` (`#15803D` ×322) — дизайн-токенов нет, тёмная тема неизбежно расходится; Tailwind v4 установлен, но используется в 31 файле, основа — `globals.css` 3 498 строк; 15 самописных модалок — 0 `role="dialog"`, 0 focus-trap, Escape у 4; `aria-label` 85 на 699 файлов; 0 клавиатурных шорткатов; `fetch` в `useEffect` в 77 компонентах без SWR/React Query (каждый со своим loading/error). Мобайл: drawer-сайдбар ≤768, KPI-ряды схлопываются, но `globals.css:2197` переопределяет inline-паддинги через `[style*="padding:28px 32px"] !important` — симптом layout в inline-стилях; планшет 769–1 100 не учтён. Checkout одним экраном в `CartPageContent.tsx` (1 056 строк).

---

## 7. Отчётность и аналитика

**Правильно.** Единое определение P&L (`lib/accounting/profit-rules.ts:15-34`, `profit.ts:27-34`) используют «Звіти», «Огляд», «Аналітика»; ОСВ, взаиморасчёты, кредиторка, баланс МП — все читают леджер. Закрытый период реально неизменяем. Факт-таблицы для BI чистые: `money_entries`, `stock_movements`, `acc_document_lines`; views `ar_*`, `admin_products_list`; агрегаты `gsc_daily`, `ads_spend`, `ai_agent_runs` с `cost_usd`.

**Расхождения (оценочные экраны и экспорт).**
- **R1/R2 (High).** `app/api/admin/finance/profit-export/route.ts:47,55-72`: Excel «Чистий прибуток» = выручка − COGS − комиссия МП − `delivery_cost`, без `acquiring_fee`, `np_fee`, `np_deduction`, `rz_delivery_fee`, которые вычитают экраны; колонка названа «чистий», хотя OPEX/налоги не вычтены; заказ без проводок → `revenue = total_price, cogs = 0` → 100 % маржа. Подтверждено на `main`.
- **R3–R5 (Medium).** UTC вместо Киева: `profit-export:32-33` и `orders/export:36-37` фильтруют `delivered_at >= 'YYYY-MM-DDT00:00:00'` без зоны; `analytics/page.tsx:281,294` помесячно по `created_at.slice(0,7)` (UTC-месяц), «Огляд» — по киевскому; `reports`, `trial-balance`, `cashflow`, `profit-export` ставят `dateTo` = `toISOString().slice(0,10)` — после 21:00 Киева «сегодня» = вчера. Готовый `lib/kyiv-date.ts` не используется.
- **R6–R8 (Medium).** Аналитика знает комиссию только `prom/rozetka`, «Огляд» — ещё `epicentr`; «Топ товаров» считает себестоимость средневзвешенной за 6 мес и комиссию по ставке, «По каналах» на той же странице — факт из леджера; «Рух грошей» без `novapay`, «Звіти → Cash Flow» — с ним.
- `orders/export` `.limit(5000)`; `procurement/demand` без лимита, O(skus × orders).
- **Для ФОП нет главного отчёта:** Книги обліку доходів (доход по дате поступления денег для ЕП 2 группы). Данные в леджере есть (кредит `customer` с `doc_type in ('payment','customer_payment')` + `novapay`), отчёта нет. План счетов — enum без кодов УПСБО; НДС не моделируется (корректно для 2 группы, но потребует колонки `vat_rate` при смене группы/ТОВ). CommerceML/экспорта проводок и документов нет.

BI-препятствия: `orders.items` jsonb, `channel_code` как свободный текст без таблицы `channels` (`NULL` vs `'website'`), `counterparty_id` с префиксами, нет read-only роли для BI, нет материализованных агрегатов (все экраны считают на запрос).

---

## 8. Интеграции и автоматизация

Интеграций 12 (Prom, Rozetka, Epicentr, НП, RZ-доставка, Monobank, NovaPay, RozetkaPay, Zoho, Google Ads/GSC, Anthropic, R2). Креды NovaPay/Rozetka/Google Ads — в `app_settings` с ротацией и UI; сырые payload'ы хранятся; идемпотентность Rozetka/Epicentr/Mono — unique-индексы; алерты с тротлингом; 18 Vercel-кронов + ежедневный дайджест из 14 детерминированных сигналов; самолечение пушей статусов/ТТН кроном вместо надежды на fire-and-forget. Это зрелая интеграционная практика.

Слабости: нет общего адаптера каналов (четвёртый маркетплейс = копия ~300 строк + колонка `*_order_id` в `orders` + правки в ~20 файлах, 23 файла знают про `prom_commission_pct`); нет outbox/очереди (Vercel Queues/Workflow не используются) — длинные операции живут в request-handler'ах (`sync-suppliers`, `prom-feed` на каждый запрос краулера, 20 роутов с `maxDuration` 120–800 с); дедуп клиентов по сырому телефону (`prom-sync:139`, `epicentr-sync:80`) при наличии `customers.phone_digits`; 10 из 23 кронов не алертят при падении, включая финансово значимый `sync-delivery-status`; четыре отключённых GitHub-workflow синка — мёртвый код. Для 1С/BAS: стабильные ID есть, выгрузки документов/проводок нет, нужна таблица соответствия счетов.

---

## 9. Сравнение с ERP-практикой (что применимо на этом масштабе)

| Практика | Статус | Нужно ли |
|---|---|---|
| Документы с проведением/сторно, журнал проводок, ОСВ | есть | ядро |
| Закрытие периода | есть, только для леджера | расширить на склад/документы/оплаты (lock date «на всё», как в Odoo/1С) |
| Проведение одной транзакцией (`action_post`) | **нет** | да — самое дорогое отсутствие |
| Инварианты/самопроверка ежедневно | есть | плюс, которого нет у Odoo/SAP из коробки |
| План счетов с кодами | enum без кодов | при 1С-обмене |
| Audit log на справочниках (клиенты, товары, настройки) | частично | да |
| Роли по модулям | 2 роли, страницы не разграничены | при росте команды |
| Reorder-point / MRP | ручной порог | да — быстрый эффект |
| CRM: карточка клиента с историей заказов/оплат/обращений | нет `/admin/customers` | да; воронка лидов — нет (B2C+МП) |
| Bank reconciliation UI | есть | сильная сторона |
| Reporting engine | нет, каждый отчёт — страница | Metabase на read-only роль дешевле |
| REST API для внешних систем | только фиды и вебхуки | понадобится для 1С и B2B |
| Мультивалюта, НДС, approval workflow, лоты/сроки | заложено/нет | не нужно сейчас |

---

## 10. План модернизации

### Критично (дни; без этого система не защищена и не надёжна)
1. **RLS:** `REVOKE SELECT (price_cost, price_drop, price_wholesale, supplier_sku) ON product_stock FROM anon, authenticated` (или view `product_stock_public` + policy), то же для `products` (`supplier_sku`, `purchase_ratio`, `*_markup_pct`); пересоздать `ar_aging`/`ar_balances` с `security_invoker` + REVOKE от anon/authenticated; переписать 2 клиентских `product_stock(*)` в wishlist; удалить INSERT-политики на `orders` для anon/authenticated. Миграция prod → сразу test. Проверить advisor «security_definer_view».
2. **Ротировать `CRON_SECRET`** (Vercel env + GitHub secrets + pg_cron SQL-джобы, если ещё ссылаются); вынести токен из DDL в `vault`/`app_settings`; переписать `set_marketplace_sync_interval` или удалить вместе с `ensure-marketplace-sync`.
3. **`next` → 16.4.3**, `sharp` → 0.35.5, `undici`/`postcss` по `npm audit fix` (не `--force`), прогнать полный гейт. Заменить `xlsx` на `exceljs` в 5 точках парсинга недоверенных файлов (партнёры, письма, реестры, прайсы).
4. **Учёт:** `SKIP LOCKED` → `FOR UPDATE` в `consume_stock_fifo`; добавить инвариант I9 «Σ `remaining_qty` партий = `stock_balance.qty_total`» и I10 «РН = проводка = оплата» (`amount_paid` = Σ `order_payments`); удалить/переписать `shipment:payment-type:*` и `payment:confirmed:*` в PATCH заказа поверх `applyOrderPayment`; не глотать ошибку леджера в `order-payment.ts:131`; убрать `maybeSingle` при отмене (все проведённые РН без `reversal_of`).
5. **Пагинация:** `periods/route.ts:38` → SQL-агрегат; `product_stock`/`products` в 8 админ-экранах → `fetchAllRows`; `order('id')` в трёх range-циклах; `products/import:410` проверка slug через `eq`, не полную выборку.
6. **`profit-export`** — пересчитать по `profit-rules.ts`, переименовать колонку, заказы без проводок исключать/помечать; UTC-границы → `lib/kyiv-date.ts` во всех экспортах и `dateTo` по умолчанию.

### Важно (недели; надёжность учёта и запас по масштабу)
7. **`post_document(doc_id, by)` в plpgsql** — проведение `sale/receipt/return/write_off/inventory` одной транзакцией; `confirmDocument` становится вызовом RPC. Guard закрытого периода на `stock_movements`, `acc_documents`, `order_payments`; `EDIT_GUARD_ENFORCE = true` после прогона наблюдений.
8. **`order_lines`** вместо `orders.items` (этап 1 по SYSTEM.md): FK на products, цена/скидка/источник по строке, РН строится из них; убрать `syncSaleDraftLines`/`findSaleDivergences`.
9. **Витрина до 1 130 SKU:** серверный листинг (страницы/фасеты в SQL, `pg_trgm`/`tsvector` поиск по `name_norm`), страница товара на ISR + клиентский сегмент персональных цен, `loading.tsx` для `/product/[id]`, `prefetch={false}` на карточках; `getProductsCached` → проекция по категориям вместо всего каталога.
10. **Таймауты и локи:** `AbortSignal.timeout` во всех внешних клиентах; advisory-lock/флаг в кронах синка; батчевые upsert в `supplier-sync`; `maxDuration` у кронов; unique на `orders.prom_order_id`; дедуп клиентов по `phone_digits`; алерты в 10 кронах без них; удалить `ensure-marketplace-sync` и мёртвые workflow.
11. **Леджерные экраны на SQL:** RPC/view для ОСВ, кредиторки, остатков на дату, счётчиков статусов/каналов/сумм журнала заказов (сейчас 3 полных прохода по `orders`); `admin/page.tsx` — узкий select без jsonb.
12. **Бэкап:** добавить `auth` и `storage` в дамп, off-site копия (R2/S3 с object-lock, шифрование), еженедельные/месячные точки, документированная процедура восстановления в проект Supabase с RTO; `schema-parity` расширить на функции/триггеры/политики/индексы.
13. **Слой данных:** `createClient<Database>` как единственная фабрика, регенерация типов в CI с проверкой диффа, убрать 104 модульных клиента; zod-схемы на все `req.json()` (начать с денег: payments, discount, reprice, procurement); `catch` + единый error-handler обёртка для роутов.
14. **Безопасность второго слоя:** DKIM-проверка для реестров из почты; модерация B2B-регистрации (`is_active:false` до одобрения) или осознанное решение об открытом опте; `requireStaffPage('admin')` на 35 страницах финансов/настроек; санитизация HTML дайджеста; `proxy.ts` гейт на `/api/admin/*`; токены интеграций — в `vault`.
15. **Книга обліку доходів** и экспорт проводок/документов в xlsx (CommerceML — позже, если появится 1С).

### Желательно (месяцы; скорость разработки и UX)
16. Разрезать `AdminOrders.tsx` на `OrdersTable/OrderRow/OrderCard (side-sheet)/BulkActionsBar/TtnPanel` с React Query/SWR; одна «Новый заказ»; `dynamic()` для тяжёлых модалок.
17. `MarketplaceAdapter` (fetchOrders/mapOrder/pushStatus/pushTtn/fees) и `DeliveryProvider`; `ChannelFeeProvider` в accounting, реализации — в модулях каналов (развязать `completion.ts`); оживить `marketplace_orders` как staging с `raw_payload`.
18. UI-kit `app/components/ui/` (fmtMoney/fmtDate/StatusBadge/DataTable/KpiRow/Modal на `<dialog>`), CSS-токены цветов, Tailwind вместо inline-стилей по мере рефакторинга; сайдбар в 5 групп + Cmd+K (эндпоинты поиска уже есть); сохранённые фильтры журнала; планшет 769–1 100.
19. Outbox-таблица событий заказа + Vercel Queues/Workflow для пушей в МП, уведомлений, синка поставщиков, генерации фидов (кеш `prom-feed` 5–15 мин).
20. `[locale]`-сегмент вместо `app/ru/`; `@/` импорты; `lib/` по доменным папкам; `.env.local.example` полный + `lib/env.ts` на все ключи; README.
21. Структурированные логи с request-id + Sentry/OTel; `lib/monitoring.ts` слить с `alertAdmin`; `'use cache'`/`cacheLife` вместо `unstable_cache` по мере стабилизации Next 16.
22. Metabase на read-only роль поверх `money_entries`/`stock_movements`/`order_lines`; таблица `channels`; reorder-point по скорости продаж; карточка клиента `/admin/customers` с историей и activity log.

### Что уже правильно и не нужно переделывать
Учётное ядро (`record_money_txn`, append-only, инварианты, FIFO, резервы, «Вариант 3», `inventory_transit`, «Вариант B», период-lock, ОСВ, рознесение оплат в копейках); статус-машина заказа с `via` и запобіжниками из реальных инцидентов; `auth-guard`/`cron-auth`; Monobank-вебхук; `escapeOrTerm`; единая формула цен МП и `profit-rules.ts`; `fetchAllRows` с ретраем 57014; ISR с `generateStaticParams` и тег-инвалидацией; `admin_products_list`; bank reconciliation/aging/акт сверки/возвраты/landed cost; 13 workflow с бэкапом-restore-test, parity, secdef-guard, инвариантами; интеграционные тесты на живой схеме; документация `docs/SYSTEM.md`/`ORDER-LIFECYCLE.md`, честно фиксирующая долг.

---

## Итоговый технический вердикт

Проект — на две трети профессиональный продукт. Учётная модель, идемпотентность денег, инварианты и операционная дисциплина (бэкап с восстановлением, parity, secdef-guard) — это уровень, которого нет у большинства «магазинов с админкой», и его стоит сохранять. Расстояние до коммерческого продукта измеряется не переписыванием, а закрытием конкретного списка: **сегодня** — RLS-утечка цен и дебиторки, секрет крона в git, уязвимый Next, anon INSERT в заказы; **в ближайшие недели** — атомарное проведение документа, `FOR UPDATE` в FIFO, два legacy-пути оплаты, недостающие инварианты, 12 непагинированных экранов и пороги 1 000/1 130 SKU; **в ближайшие месяцы** — `order_lines`, серверный листинг витрины, типизированный слой данных с валидацией входа, декомпозиция `AdminOrders`, адаптеры каналов, бэкап с off-site и `auth`. После «критично» + «важно» это система, которой можно доверять ежедневный учёт и которую можно масштабировать в 5–10 раз без смены стека; после «желательно» — продукт, который можно развивать командой, а не одним человеком.
