# Полный аудит проекта buildmarket (fixline.com.ua) — 2026-07-18

Next.js 16.2.3 (App Router) + Supabase + Vercel. ~94k строк TS/TSX, 169 API-роутов (129 в admin), 55+ модулей в lib/.
Аудит выполнен с нуля по 6 направлениям: архитектура/качество кода, безопасность (OWASP), производительность, конвенции Next 16, тесты/CI, база данных (Supabase advisors + npm audit).

Типы проходят (`tsc --noEmit` = 0 ошибок). Критических дыр в безопасности нет. Главные реальные риски — **производственные**: тихое обрезание запросов на 1000 строк уже искажает фиды и финансы, и `headers()` в layout обнуляет ISR по всему сайту.

---

## P0 — Исправить в первую очередь (реальный ущерб уже возможен)

### 1. PostgREST молча режет ответы на 1000 строк — фиды и финансы уже неверны
`product_characteristics` = 10 594 строк, товаров 768 (впритык к лимиту). Коммит «paginate full-table reads» починил только 3 файла. Остались непагинированными:
- **Фиды маркетплейсов** (отдают неполный каталог): `app/api/feed/prom/route.ts:47-63`, `app/api/feed/google/route.ts:76-85`, `app/api/prom-feed/route.ts:291-301` (products/stock/categories), `app/api/rozetka/feed/route.ts:26-32`.
- **Финансы** (молча неверные деньги при росте `money_entries`): `app/admin/finance/payables/page.tsx:21-26`, `app/admin/finance/cashflow/page.tsx:40-44` (opening balance), `app/admin/finance/reports/page.tsx:57-60,115-119`, `app/admin/finance/page.tsx:39-65`, `settlements/page.tsx:29-33`.
- **Админ-список товаров**: `app/admin/products/page.tsx:19-27` (счётчик встанет на 1000).
- **Агрегаты статусов/сумм**: `app/admin/page.tsx:62-63`, `app/admin/prom/orders/page.tsx:24-27` (лучше DB-агрегат count/sum).
Решение: использовать существующий `fetchAllRows` из `lib/db-paginate.ts`; для счётчиков — `count:'exact', head:true`.

### 2. Обновить Next.js 16.2.3 → 16.2.10
`npm audit`: пачка advisories для 16.2.3 — обход middleware/proxy, cache poisoning, XSS с CSP-nonce, DoS Image Optimization, SSRF при WebSocket upgrade. Фикс — минорный bump до **16.2.10** без breaking changes. Также `npm audit fix` закрывает esbuild (dev-only).

### 3. `cabinet/products` отдаёт дроп-цены любому залогиненному
`app/api/cabinet/products/route.ts:14` — проверка только `if (!user)`, без `getRole(user)==='dropship'`. Любой розничный покупатель после регистрации видит оптовые дроп-цены по всем SKU. Все прочие cabinet-роуты роль проверяют — пропущен один.

---

## P1 — Высокий приоритет

### Безопасность
- **Открытый прокси на Nova Poshta**: `app/api/novaposhta/route.ts:5-26` — без auth пробрасывает произвольные method/props с серверным ключом NP. Нужен allowlist (только поиск города/отделения).
- **Open redirect**: `app/auth/callback/route.ts:64` — `next` из query не валидируется (`?next=.evil.com`). В `proxy.ts:122` защита есть, тут нет — скопировать проверку `startsWith('/') && !startsWith('//')`.
- **Stored XSS в админке**: `app/admin/prices/PricesClient.tsx:704,706,741` — данные клиента (`company/name/email`) в `win.document.write` и `innerHTML` без экранирования; клиент с `</script>…` в названии компании выполнит JS у админа.
- **Уязвимый xlsx 0.18.5** (prototype pollution + ReDoS, фикса в npm нет) парсит недоверенные файлы: `app/api/cabinet/orders/parse/route.ts:79` (загрузки партнёров, **без лимита размера** — zip-bomb), `admin/suppliers/[id]/sheets`, `admin/products/import`. Мигрировать парсинг на exceljs либо ставить xlsx с cdn.sheetjs.com; добавить лимит размера как в import (10 МБ).

### Производительность
- **Страница товара `force-dynamic`**: `app/product/[id]/page.tsx:33` (+ `ru`) — самая посещаемая страница рендерится динамически на каждый запрос ради B2B-цен. Вынести персональные цены в Suspense/клиентский сегмент, каркас оставить на ISR.
- **`headers()` в корневом layout** (`app/layout.tsx:49-51`) переводит весь сайт в dynamic rendering → все `export const revalidate` на ~15 страницах не дают ISR-кеша HTML (работает только кеш данных). Определять `lang` по сегменту `/ru`, а не через глобальный `headers()`.
- **Footer на 34 страницах** (`app/components/Footer.tsx:73-78`) тянет весь каталог (`getProductsCached`) + свой `headers()` ради топ-брендов. Вынести в лёгкую кешированную функцию `brand,count`.

### Архитектура / качество
- **vidatkova vs vydatkova — две живые реализации одного документа** (видаткова накладна) с РАЗНЫМИ реквизитами продавца: `/vidatkova/[id]` (из учёта + email) берёт `BANK_*/SIGNATORY_NAME`, `/vydatkova/[id]` (из AdminOrders) — `BANK_RECIPIENT/COMPANY_*`. Клиент получает разные накладные в зависимости от экрана печати. Плюс серверные `lib/vidatkova-html.ts`/`-pdf.ts` — итого 4 рендера. Свести к одной.
- **Функция «сумма прописью» скопирована 8 раз** (уже разошлись): invoice-excel, InvoicePrint, VidatkovaNakladna, VydatkovaPrint, `lib/invoice-html/-pdf`, `lib/vidatkova-html/-pdf`. Вынести в `lib/number-to-words.ts`.
- **Нет слоя доступа к данным**: 162 файла инлайн создают service-role клиент на уровне модуля, хотя есть 3 готовые фабрики (`createServiceClient` и др.). Переименование колонки = правка десятков файлов без типовой страховки.
- **Базовый URL захардкожен**: `https://fixline.com.ua` в 81 файле (98 вхождений), при этом `NEXT_PUBLIC_SITE_URL` используется лишь 17 раз. Одна константа `lib/site.ts`.

### Тесты
- Денежные входы без тестов: **monobank webhook** (`app/api/webhooks/monobank/route.ts`, 330 строк), **checkout re-pricing** (`app/api/orders/route.ts`), промокоды. Синки остатков/цен и весь admin/auth-периметр — тоже.
- Треть unit-тестов — тавтологии, которые не могут упасть: `tests/payout.test.ts` (валидирует функции, определённые внутри теста; в роуте их нет), `tests/partner-balance.test.ts:141-178`, хвост `tests/reservations.test.ts:152-178`. Дают ложное чувство защищённости pre-push гейта.
- Интеграция гоняется только на push в main, не на PR — регресс в учёте виден лишь после мержа.

---

## P2 — Средний приоритет

### База данных (Supabase advisors, prod)
- **`guard_user_metadata()` (SECURITY DEFINER)** всё ещё исполняема ролями anon/authenticated через REST RPC — сделать `REVOKE EXECUTE` (миграция 055 применена, но revoke не полный).
- **Включить защиту от скомпрометированных паролей** (HaveIBeenPwned) в Auth.
- **12 RLS-политик** с `auth.uid()` без `(select auth.uid())` — перевычисление на каждую строку (`orders`, `wishlists`, партнёрские таблицы).
- **16 дублей permissive-политик** на `wishlists` (старые `own wishlist *` + новые `wishlists_owner_all` одновременно) — удалить устаревшие.
- **46 FK без индексов**, 45 неиспользуемых индексов — почистить.
- **Дрейф схем prod↔test**: в тестовом проекте не хватает миграций `039_prom_attributes`, `040_promo_codes`, `brand_logos`, `rozetka_order_sync`, `carrier_accepted_at`, `product_faq`, `product_slug` и др. → интеграционные тесты идут против неполной схемы. (Память говорит про дисциплину синка после каждой миграции — расхождение накопилось.)

### N+1 и последовательные await
- `lib/accounting/fulfillment.ts:164-197` — `resolveDropshipFallback()` в цикле по строкам заказа (N×2-4 round-trip); батчить через `.in(skus)`.
- `lib/prom-sync.ts:31-56` / `lib/rozetka-sync.ts:21-63` — per-order проверка/поиск клиента + `products.in` на каждое заказ; батчить.
- `lib/accounting/dropship.ts:65-97,198-226` — независимые запросы await-ятся последовательно, объединить в `Promise.all`.

### Клиентский бандл / изображения
- **`images.unoptimized:true`** глобально (`next.config.ts:33`) — оригиналы полного размера под боксы 200-400px в сетках магазина/каталога. Худший фактор LCP/трафика.
- Per-navigation fetch: `SalesBanner`/`PromoBanner` дёргают `/api/promo`, ShopClient/CatalogClient — `auth.getUser()` в useEffect ради `isWholesale` (сервер это уже знает). Передавать пропсами с сервера.
- `ChatWidget` polling `/api/chat` каждые 5с без backoff, статически в layout — под `next/dynamic({ssr:false})`.

### Next.js гигиена
- **7 устаревших `@ts-ignore`** над корректными `revalidateTag(tag,'max')` (`admin/products/route.ts:207,234,268`, `admin/blog/route.ts:17`, `admin/products/import/route.ts:422-428`) — сигнатура двухаргументная типизируется без подавления. Именно этот класс подавлений уже вызывал рантайм-краши в репо. Удалить.
- Нет `app/global-error.tsx` — ошибка в корневом layout (он делает `headers()`) даст стандартную страницу Next без брендинга и без отправки в monitoring.
- `export const revalidate` в `app/api/products/route.ts:4` не действует (роут динамичен из-за чтения query) — вводит в заблуждение.

### Обработка ошибок / мёртвый код
- 114 из 169 роутов без `catch` — кривое тело/сбой fetch к NP/Zoho даёт неструктурированный 500.
- Пустые `catch {}` глушат важное: `lib/telegram.ts:26` (упавшее уведомление о заказе исчезает молча).
- `lib/blog.ts` (631 строка статических статей) — мёртвый, блог читается из БД. `lib/monitoring.ts` — используется 1 файлом, остальные 62 места пишут `console.error` напрямую (алертинг фактически не работает).
- `as any` — 28 шт., худшее в ценовой логике `app/api/admin/prices/pricelist/route.ts:94-178` (финрасчёты без типов). Решается генерацией типов Supabase (`generate_typescript_types`).

---

## P3 — Низкий приоритет / гигиена

- **SSRF** через `supplier.source_url` (admin-only): `admin/suppliers/[id]/sheets/route.ts:31`, `lib/supplier-sync.ts:234` — https-only + запрет приватных IP.
- **Слабый CSP**: `next.config.ts:19` — `script-src 'unsafe-inline' 'unsafe-eval'`. Убрать хотя бы `'unsafe-eval'`.
- **Rate-limiter обходится**: берётся первый `x-forwarded-for` (клиент подставляет сам) + in-memory per-instance. Нужен доверенный IP + KV. Плюс два независимых limiter'а (`proxy.ts` без евикта Map + `lib/rate-limit.ts`).
- **Defense-in-depth**: `proxy.ts` не покрывает `/api/admin/*`; сегодня все 129 роутов проверяют роль сами, но новый роут без проверки будет открыт. Общий гейт в proxy.
- **RU-локаль** — параллельное дерево `app/ru/` (18 файлов, ~75% копий) + 3 механизма перевода (`lib/ru.ts`, `translations-ru.ts`, `lib/lang.ts`). Правка UA-страницы требует ручного зеркалирования.
- **Магическое `3000`** (мин. опт) в 3 местах (`api/orders:116`, `CartPageContent:8`, `CatalogClient:21`) — рассинхрон = 400 на checkout. Одна константа.
- **`lib/env.ts` валидирует 3 переменные**, а 506 прямых `process.env.*` (BANK_*, NP, TELEGRAM, ZOHO…) не проверяются — отсутствие = пустые реквизиты в накладной, а не ошибка на старте.
- **Гигиена репо**: трекаются `export-products-28-04-26_20-13-13.xlsx`, `products-template.xlsx`, lock-файл `~$products-template.xlsx` (с именем пользователя ОС) — убрать из git. `fixline-audit.zip`/`lint-new.txt` уже в .gitignore.
- **rozetka-фид без секрета** (`app/api/rozetka/feed/route.ts:21`) — прочие фиды защищены `FEED_SECRET_KEY`; непоследовательно (не утечка — только розничные цены).
- **Публичные документы по UUID заказа** (`invoice/`, `vidatkova/`, `vydatkova/[id]`) — service-role выборка ПДн по угадываемому id, который циркулирует в письмах/логах. Лучше revocable-токен, как у `review/[token]`.
- Lint нигде не запускается автоматически (нет в CI и хуках); `scripts/**` исключён из линта.
- SEO-контент в коде: `lib/category-descriptions(-ru).ts` (2×695 строк) — правка текста = деплой.

---

## Что проверено и в порядке

- **Авторизация**: все 129 admin-роутов проверяют `getUser()` + `app_metadata.role==='admin'`; все 8 cron — `Bearer CRON_SECRET`; вебхуки (monobank RSA-PSS + идемпотентность + сверка суммы, telegram secret token).
- **IDOR не найден**: cabinet/orders, wishlist, payout/topup фильтруют по id сессии.
- **Checkout** пересчитывает цены на сервере из `product_stock`, промо валидирует на сервере.
- **Сессии**: везде `getUser()` (не `getSession()`), `@supabase/ssr` getAll/setAll корректно. CSRF: SameSite=Lax + JSON-body — приемлемо.
- **Service-role ключ** не протекает в client-бандл; NEXT_PUBLIC_* только URL+anon key. Секретов в git нет.
- **XXE безопасен** (fast-xml-parser не парсит внешние сущности), formula injection не эксплуатируется (настоящий .xlsx), upload изображений admin-only с sharp + анти-traversal + лимит 10 МБ.
- **Next 16 миграция аккуратна**: proxy-конвеншен, async params/searchParams, двухаргументный revalidateTag, валидные OG-типы (рецидива E237 нет), чистые route handlers.
- **Учётное ядро** `lib/accounting/` — чистый DAG без циклов, покрыто образцовым интеграционным тестом (PO→Receipt→Sale→Storno, FIFO, резервы, `check_invariants` после каждого шага).
- **CI есть** (`.github/workflows/test.yml`): tsc + unit на каждый PR, интеграция на push в main. Git-хуки установлены.
