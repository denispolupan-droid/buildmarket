# Як влаштована система

Актуально на 15.10.2026. Мета документа — щоб нова людина або агент за 15 хвилин
зрозуміли, з чого складається FIXLINE, де проходять межі й що не можна робити.
Подробиці по замовленню — `docs/ORDER-LIFECYCLE.md`; правила коду — `AGENTS.md`.

## Що це

Next.js 16 (App Router) + Supabase Postgres, хостинг Vercel. Один моноліт, у якому
живуть три продукти:

| Частина | Шлях | Хто користується |
|---|---|---|
| Публічний магазин (uk/ru), блог, фіди | `app/`, `app/shop`, `app/product`, `app/blog`, `app/api/feed*` | покупці, пошуковики, ШІ-краулери |
| Кабінет партнера (дропшип / опт) | `app/cabinet`, `app/catalog`, `app/api/cabinet/*` | партнери |
| Адмінка (ERP) | `app/admin`, `app/api/admin/*` | власник, менеджер |

Плюс фон: 18 кронів на Vercel (`vercel.json`), вебхуки (Monobank, Telegram, Mono-виписка),
GitHub Actions (тести, інваріанти, нічний дамп, health-check).

## Домени (lib/)

| Домен | Де | Суть |
|---|---|---|
| Облік | `lib/accounting/*` | подвійний запис через функцію БД `record_money_txn`; документи (`acc_documents` + рядки), FIFO-склад, резерви, партнерський леджер, коригування боргу, закриття періодів. Інваріанти I1–I10 (`check_invariants`) |
| Замовлення | `lib/orders/*`, роути `app/api/admin/orders/[id]/*` | статуси й переходи (`status.ts`), запобіжники відгрузки (`ship-guards.ts`), режим виконання, об'єднання посилок |
| Маркетплейси | `lib/prom-*`, `lib/rozetka-*`, `lib/epicentr-*`, `lib/marketplace-*` | імпорт замовлень, пуш статусів/ТТН, фіди, комісії (`lib/marketplace-pricing.ts` — єдина формула цін), чати, сторож скасувань/повернень |
| Доставка | `lib/delivery-sync.ts`, `lib/np-*`, `lib/rz-delivery*`, `lib/rozetka-delivery*` | Нова Пошта, точки видачі Rozetka, ROZETKA Доставка власного договору; синк руху посилок → проведення продажу |
| Гроші ззовні | `lib/mono-*`, `lib/novapay-*`, `lib/rozetkapay-*`, `lib/mail-registers*` | виписки й реєстри виплат → розкладання по замовленнях |
| Каталог і ціни | `lib/pricing.ts`, `lib/supplier-sync.ts`, `lib/char-*`, `lib/product-*` | прайси постачальників → `supplier_stock` → тригер → `product_stock`; характеристики, фасети |
| SEO / контент / ШІ | `lib/seo/*`, `lib/blog-*`, `lib/ai-*`, `lib/marketplace-chat-assistant.ts`, `lib/product-card-*` | метадані, sitemap, GSC, llms.txt, чернетки статей, ШІ-агенти (лише чернетки під затвердження людини) |
| Сповіщення | `lib/notify/*`, `lib/telegram.ts`, `lib/alert.ts` | покупцю (email/Telegram), адміну (Telegram-алерти з тротлінгом 30 хв) |

Поки `lib/` плоский (близько 200 файлів); перегрупування в папки доменів — етап 2.

## Дані

- Схема — `supabase/schema/baseline-2026-10-03.sql` + міграції `supabase/migrations/` від 128.
  Зміни схеми лише міграціями, prod → одразу test. Типи — `types/database.types.ts` (генеруються).
- Гроші: `money_entries` append-only, ідемпотентні ключі, баланси контрагентів тригером.
- Склад: `stock_movements` append-only, `stock_balance` тригером, партії FIFO, резерви.
- Замовлення: `orders` (позиції в jsonb `items`); `order_lines` — дзеркало цього jsonb
  тригером (з 31.10.2026, етап A `docs/ORDER-LINES-PLAN.md`): код його поки не читає й
  не пише, I9/I10 стежать за збігом; `order_status_history` веде тригер незалежно від коду.
- RLS увімкнений на всіх таблицях; публічно читаються лише каталог, категорії, контент, бренди.
  Сервер ходить із service role; браузер — лише anon/user.

## Безпека

- `/api/admin/*` — `requireStaff` (ще є `checkAdmin` і ручний `getUser`, зводиться до одного — етап 2).
- Крони — `cronAuthorized` (закрито, якщо немає `CRON_SECRET`). Вебхуки: Monobank — підпис ECDSA,
  Telegram — секрет у заголовку, Mono-виписка — секрет у запиті.
- Ціни завжди перераховуються на сервері; підсумок замовлення — лише з рядків.
- Заголовки безпеки й CSP — `next.config.ts`; rate limit у `proxy.ts` (у пам'яті інстансу, базовий).

## Надійність

| Що | Як |
|---|---|
| Тести | юніт (vitest, ~1100), інтеграційні обліку (тестова база), e2e адмінки (Playwright, тестова база), e2e вітрини (локально) |
| Гейти | pre-push: tsc + юніт; CI: tsc, eslint, юніт, build, інтеграційні + e2e адмінки, інваріанти |
| Бекап | нічний `pg_dump` + тестове відновлення в чистий PG17 зі звіркою рядків (`backup-db-full.yml`) |
| Моніторинг | інваріанти щодня; 500-ті → Telegram (`instrumentation.ts`); health-check кожні 2 год; алерти кронів |
| Відкат | Vercel: попередній деплой однією кнопкою; база: дамп за добу (PITR немає — nano-тариф) |

## Чого не робити

- Не писати `orders.status`, `money_entries`, `acc_documents` напряму — лише через `lib/orders/status`
  і `lib/accounting`.
- Не читати `headers()/cookies()/searchParams` у кешованих серверних компонентах.
- Не класти персональні ціни в спільний кеш.
- Не застосовувати схему до прода повз міграції; не ганяти повний `next build` проти прода.
- Не запускати e2e адмінки проти прода (конфіг і setup це блокують, але не покладайся лише на них).
