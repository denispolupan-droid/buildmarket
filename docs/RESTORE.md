# Відновлення бази з нічного дампу

Актуально на 31.10.2026. Дамп робить `.github/workflows/backup-db-full.yml` щодня о 04:30 за Києвом.
PITR на nano-тарифі немає, тож **RPO — до 24 годин** (втрачається все після останнього дампу).
**RTO — 1–2 години** руками за цим документом (найдовше — створити проєкт і перевірити ключі).

## Що лежить у бекапі

| Файл | Що всередині | Куди відновлювати |
|---|---|---|
| `fixline-<stamp>.dump` | схема + дані `public` (замовлення, облік, каталог) | будь-який Postgres 17 / проєкт Supabase |
| `fixline-<stamp>.auth.dump` | дані `auth.users`, `auth.identities` (логіни, ролі в `app_metadata`) | лише проєкт Supabase (схему `auth` веде Supabase) |
| `fixline-<stamp>.storage.dump` | метадані `storage.buckets/objects` | проєкт Supabase; самі файли — у Storage/R2 окремо |
| `fixline-<stamp>.schema.sql` | схема `public` текстом | для перегляду/дифу |
| `counts.txt`, `auth-counts.txt` | кількість рядків на момент дампу | звірка після відновлення |

Де взяти: GitHub → Actions → «Nightly full database dump» → артефакт `db-dump-N` (30 днів) або
`weekly-db-dump-N` (90 днів). Якщо GitHub недоступний — R2-бакет `R2_BACKUP_BUCKET`, теки `daily/`,
`weekly/`; файли `*.enc` розшифровуються так:

```
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass pass:<BACKUP_PASSPHRASE> -in X.dump.enc -out X.dump
```

## Порядок

1. **Новий проєкт Supabase** (той самий регіон `eu-central-1`, Postgres 17). Узяти рядок підключення
   Session pooler, порт 5432.
2. **public** (схема + дані):
   ```
   pg_restore --dbname "$NEW_DB_URL" --no-owner --no-privileges --jobs 2 fixline-<stamp>.dump
   ```
   Помилки виду «already exists» для розширень і ролей — норма. Помилок по таблицям `public` бути не повинно.
3. **auth** (лише дані, схема вже є в проєкті):
   ```
   pg_restore --dbname "$NEW_DB_URL" --data-only --no-owner --disable-triggers fixline-<stamp>.auth.dump
   ```
   Без цього кроку ніхто не залогіниться, а `customers.auth_user_id` вказуватиме в нікуди.
4. **storage** — так само `--data-only` з `*.storage.dump`, потім перенести файли бакетів (рахунки
   постачальників) з дашборду старого проєкту, якщо він живий. Фото товарів — у R2, їх не чіпаємо.
5. **Права й гранти.** Дамп робиться з `--no-privileges`, тож гранти треба повернути: прогнати
   міграції, що їх задають — `053`, `059`, `062_revoke`, `068`, `116`, `126`, `137`–`141`
   (`supabase/migrations/`), через Management API як звичайні міграції. Потім перевірити:
   анонімним ключем `GET /rest/v1/product_stock?select=sku,price_cost` має дати **42501**,
   `select=sku,price_retail` — **200**.
6. **Історія міграцій**: `supabase_migrations.schema_migrations` з дампу `public` не відновиться
   (інша схема) — додати записи від `136_order_lines` до останньої вручну, щоб наступні міграції
   накочувались без конфліктів.
7. **Звірка**: кількість рядків з `counts.txt` / `auth-counts.txt`; `select * from check_invariants()` —
   усі 12 OK; крон `/api/cron/secdef-guard` — без відкритих SECURITY DEFINER.
8. **Перемкнути застосунок**: у Vercel змінити `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` (production + preview), у GitHub — `SUPABASE_DB_URL`, редеплой.
   pg_cron-задання (`expire-stock-reservations`, `cleanup-*`) створити заново — вони живуть у схемі `cron`.
9. **Повідомити**: Monobank/NovaPay вебхуки дивляться на домен, а не на базу — їх не чіпаємо.
   Дані, що прийшли після дампу (замовлення МП, виписки), доберуть крони синку за 2–7 днів назад.

## Що треба один раз налаштувати власнику

Секрети GitHub для копії в R2 (поки їх немає, крок просто пропускається):
`R2_BACKUP_BUCKET`, `R2_BACKUP_ENDPOINT` (`https://<account>.r2.cloudflarestorage.com`),
`R2_BACKUP_ACCESS_KEY_ID`, `R2_BACKUP_SECRET_ACCESS_KEY`, `BACKUP_PASSPHRASE`.
Бакет — окремий від фото товарів, без публічного доступу; пароль шифрування зберігати поза GitHub.
