# FIXLINE — buildmarket

Цифрова платформа будівельних матеріалів: вітрина (роздріб, опт, дропшип),
адмінка з повним обліком (документи, леджер, склад, взаєморозрахунки, ФОП),
інтеграції з Prom, Rozetka, Епіцентром, Новою Поштою, Monobank, NovaPay, Zoho.

Стек: Next.js 16 (App Router, ISR), React 19, TypeScript, Supabase (Postgres,
Auth, Vault), Vercel (хостинг і крони), Cloudflare R2 (фото), Resend, Telegram.

## Запуск локально

```bash
npm ci
cp .env.example .env.local      # заповнити; токени інтеграцій — у Vault, не тут
npm run dev                     # http://localhost:3000
```

`next dev` сам читає `.env.local` — не підставляй його через `source`.
Другий dev-сервер поруч потребує окремого `NEXT_DIST_DIR`.

## Перевірки (те саме гейтить CI, `.github/workflows/test.yml`)

```bash
npx tsc --noEmit            # типи
npm run lint                # eslint
npm run test:run            # юніт (vitest), зокрема tests/architecture.test.ts
npm run test:integration    # облік на тестовій базі (.env.test)
npm run build               # next build
npm run test:e2e            # Playwright проти npm run dev (UI-регресії)
```

Інтеграційні тести пишуть у **тестовий** проєкт Supabase (`.env.test`);
`lib/test-db-guard` не дасть запустити їх у прод.

## База даних

- Схема — лише через файли `supabase/migrations/NNN_*.sql`; після проду одразу
  той самий файл на test. Raw SQL для схеми проду не використовуємо.
- Щодня workflow `schema-parity` звіряє prod ↔ test (колонки, RLS, політики,
  функції, тригери, індекси), `db-types` — дрейф `types/database.types.ts`,
  `accounting-invariants` — інваріанти обліку I1–I10.
- Бекапи: `backup-db-full` → R2 (object-lock); відновлення — `docs/RESTORE.md`.

## Правила коду

`AGENTS.md` — обов'язкові конвенції (авторизація роутів через `lib/auth-guard`,
вибірки через `fetchAllRows`/`.limit()` + `.order()`, статус замовлення лише через
`lib/orders/status`, гроші рахує сервер, секрети через `lib/secrets`, логи через
`withApi`/`lib/log`, площадки через `lib/marketplace`). Архітектурний тест
(`tests/architecture.test.ts`) ловить порушення в CI.

## Документація

| Файл | Про що |
|---|---|
| `docs/SYSTEM.md` | Огляд системи й доменних модулів |
| `docs/ORDER-LIFECYCLE.md` | Статуси замовлення, переходи, хто й коли їх міняє |
| `docs/ORDER-LINES-PLAN.md` | План переходу з `orders.items` (jsonb) на `order_lines` |
| `docs/ACCOUNTING-AUDIT.md` | Модель обліку, проводки, інваріанти |
| `docs/RETURNS.md` | Повернення (ПВ/ПП), журнал повернень |
| `docs/RESTORE.md` | Відновлення БД з бекапу, секрети Vault після відновлення |
| `docs/BRAND.md`, `docs/CONTENT-STANDARD.md` | Бренд і стандарт текстів |
| `docs/audits/` | Аудити (останній — 2026-10-31) і статус пунктів |

## Крони (vercel.json)

Замовлення площадок (Rozetka кожні 5 хв, Prom і Епіцентр зі зсувом), звірка
карткових оплат, статуси доставки, виписка Mono, баланс NovaPay, реєстри з
пошти, синк постачальників кожні 2 год, ціни/акції опівночі, ранковий дайджест,
GSC, реклама, сторож показників. Усі — через `cronAuthorized` і `withCronLock`.

## Деплой

`main` → Vercel production автоматично. Робота ведеться в гілках і зливається в
`main` лише після зеленого гейту і явної команди власника.
