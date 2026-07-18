<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project conventions (делать правильно з першого разу)

Ці правила існують, щоб не з'являлися дірки безпеки/продуктивності/SEO. CI (`.github/workflows/test.yml`) гейтить `tsc`, `eslint`, unit-тести і `next build`.

**Авторизація роутів.** Кожен новий API-роут перевіряє права через `lib/auth-guard`:
`requireStaff('admin'[, 'manager'])` для `/api/admin/*`, `requireCustomer('dropship'|'wholesale')` для кабінету. Ніколи не роби ad-hoc `getUser()` + перевірку ролі вручну. Приклад: `app/api/cabinet/products/route.ts`.

**Читання даних.** Будь-яка вибірка списку — через `fetchAllRows` (`lib/db-paginate`) або з явним `.limit()`. Без цього PostgREST мовчки обрізає на 1000 рядків. Вибирай тільки потрібні колонки (`select('a, b')`, не `select('*')`).

**Гроші.** Ціни/суми ЗАВЖДИ перераховуються на сервері з БД; ціні від клієнта не довіряй. Логіку виноси в чисту функцію і покрий тестом (`lib/pricing.ts`, `lib/mono-signature.ts`).

**Єдині джерела правди** (не копіпасть): `lib/site.ts` (`SITE_URL`, `WHOLESALE_MIN`), `lib/company.ts` (`SELLER` — реквізити), `lib/number-to-words.ts` (сума прописом).

**Рендер / SEO.** Не читай request-time API (`headers()`, `cookies()`, `searchParams`) у server-компонентах, які мають кешуватися — це відключає ISR. Персональні дані (ціни за тарифом) НІКОЛИ не попадають у спільний кеш — тільки на клієнт/edge. `openGraph.type` — лише валідні значення (`website`/`article`).

**БД.** Зміни схеми — тільки через міграційні файли `supabase/migrations/`; після застосування на prod негайно синкай test. Не використовуй raw SQL для prod-схеми.

**Безпека вводу.** Екрануй користувацький текст перед вставкою в HTML/`document.write`/JSON у `<script>`. Fetch за користувацьким URL — через `assertPublicUrl` (`lib/safe-fetch-url`).

**Перед мержем:** `tsc` без помилок, `eslint` без errors, тести зелені, `next build` проходить (усе це гейтить CI).
