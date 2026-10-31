# План: рядки замовлення як таблиця (`order_lines`)

Статус: **етап A в проді з 31.10.2026** (міграція `136_order_lines.sql`, prod + test).
Етапи B–D — попереду. Підготовлено 28.10.2026 у межах етапу 1 плану зростання
(`docs/SYSTEM.md`, пам'ять «Рамка зростання»).

Рішення власника 31.10.2026: (1) етап A стартує; (2) **рядок без товару дозволений** —
зв'язок із каталогом через `product_id` (NULL для вільних рядків і видалених товарів),
а не строгий FK по `sku`; (3) момент C — після того як A постоїть у проді й картка
замовлення звільниться від паралельних правок.

## Чому це взагалі потрібно

Позиції замовлення живуть у `orders.items` (jsonb). Наслідки, які вже є сьогодні:

- Немає зв'язку позиція → товар: SKU в jsonb може не існувати в `products`, і база
  цього не помітить. Аналітика «що продається» рахується розбором jsonb у коді.
- Кожен читач парсить масив сам: 39 місць читання, 14 місць запису, 4 функції БД
  через `jsonb_array_elements`. Будь-яка зміна форми позиції (нове поле, інший тип
  qty) — це 50+ правок навмання.
- Резерв, часткова відгрузка, повернення по рядках, звіти постачальнику — усе
  тримається на тому, що код правильно прочитав jsonb. Інваріанти БД (I1–I8) про
  позиції замовлення не знають: сума рядків і `total_price` можуть розійтись мовчки.
- З ростом (ширший асортимент, більше замовлень, маркетплейс) без таблиці рядків
  неможливі індекси по SKU, звіти в SQL і FK-цілісність.

Що вже є і що треба враховувати: у відвантаженого замовлення позиції дублюються в
`acc_document_lines` (рядки РН, по одному документу на посилку). Це рядки
**документа**, не замовлення: до відгрузки їх немає, після часткової відгрузки їх
менше, ніж у замовленні. Тому `order_lines` не замінює їх, а стоїть перед ними.

## Схема (як застосовано в 136)

```sql
CREATE TABLE order_lines (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    uuid    NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sort_order  integer NOT NULL,                       -- позиція в items[] (з 1)
  sku         text    NOT NULL,                       -- знімок артикула
  product_id  integer REFERENCES products(id) ON DELETE SET NULL,  -- NULL = вільний рядок / видалений товар
  name        text    NOT NULL DEFAULT '',            -- знімок назви на момент замовлення
  brand       text    NOT NULL DEFAULT '',
  qty         numeric NOT NULL,
  price       numeric NOT NULL,                       -- за одиницю, уже зі знижкою
  price_base  numeric,                                -- ціна до ручної знижки
  is_promo    boolean NOT NULL DEFAULT false,
  is_bonus    boolean NOT NULL DEFAULT false,
  amount      numeric GENERATED ALWAYS AS (qty * price) STORED,
  meta        jsonb   NOT NULL DEFAULT '{}',          -- решта ключів jsonb (cost_price, volume, imageUrl, ac/bc/nl1 …)
  UNIQUE (order_id, sort_order)
);
CREATE INDEX order_lines_sku_idx     ON order_lines (sku);
CREATE INDEX order_lines_product_idx ON order_lines (product_id) WHERE product_id IS NOT NULL;
-- RLS увімкнений, політик немає: лише service role.
```

Відмінності від першої версії плану й чому:
- `product_id` замість `sku REFERENCES products(sku)` — рішення власника «рядок без
  товару дозволений». Знімок `sku/name/brand/price` лишається навіть якщо товар
  видалили (сьогодні товари видаляються фізично в трьох місцях коду; акційний
  1104-001 уже так зник після продажу).
- `UNIQUE (order_id, sort_order)`, а не `(order_id, sku)` — дзеркало не має права
  впасти на даних, яких ми не контролюємо (дубль артикула в одному замовленні).
- Без `CHECK (qty > 0)` і без фіксованої точності — з тієї ж причини; правила на
  значення приходять у C разом із єдиним модулем запису.

Поля — це рівно ті ключі, які сьогодні зустрічаються в `orders.items` (`sku, name,
brand, qty, price, price_base, is_promo, is_bonus` + допоміжні у `meta`).

## Етапи (кожен окремо оборотний)

### A. Дзеркало з jsonb у таблицю (без зміни коду) — ЗРОБЛЕНО 31.10.2026

- Міграція `136_order_lines.sql`: таблиця + `fn_order_lines_sync(order_id, items)` +
  тригер `trg_order_lines_mirror` (`AFTER INSERT OR UPDATE OF items ON orders`), який
  перебудовує рядки з jsonb (delete + insert).
- Тригер SECURITY DEFINER (EXECUTE відкликано в anon/authenticated): гостьові
  замовлення з сайту вставляє роль anon, а `order_lines` під RLS без політик.
- Тригер **не кидає помилок**: будь-який збій → `RAISE WARNING` у лог БД, запис
  замовлення проходить. Розходження ловить інваріант.
- Backfill через `fn_order_lines_sync` напряму (не UPDATE orders — щоб не будити
  `trg_order_status_history`). Прод: 746 замовлень, 1002 рядки, 999 з `product_id`,
  1 артикул без товару (1104-001). Тест: 1288/1288.
- Інваріанти: I9 — кількість рядків і Σ amount збігаються з jsonb; I10 —
  `orders.total_price = Σ order_lines.amount` (на 31.10 виконується для всіх).
  Обидва в щоденному `check-invariants` → Telegram при FAIL.
- Правило в AGENTS.md і тест архітектури: код `order_lines` **не пише** (до C).
- Відкат: `DROP TRIGGER trg_order_lines_mirror ON orders; DROP FUNCTION
  fn_order_lines_mirror, fn_order_lines_sync; DROP TABLE order_lines;` і повернути
  `check_invariants` з 062.
- Рядки без товару дивитись запитом: `SELECT o.order_number, l.sku, l.name FROM
  order_lines l JOIN orders o ON o.id = l.order_id WHERE l.product_id IS NULL;`

### B. Читачі переходять на таблицю

Перевірка готовності (31.10.2026, прод, лише читання): звіт продажів по артикулах для
`delivered`-замовлень двома шляхами — з jsonb і з `order_lines` — дав 301 артикул і
445 265,70 ₴ в обох, 0 розходжень. Запит для повторної перевірки перед кожним кроком B:

```sql
WITH j AS (
  SELECT i->>'sku' AS sku, SUM((i->>'qty')::numeric) AS qty,
         SUM((i->>'qty')::numeric * (i->>'price')::numeric) AS amount
  FROM orders o, jsonb_array_elements(o.items) i WHERE o.status = 'delivered' GROUP BY 1),
l AS (
  SELECT l.sku, SUM(l.qty) AS qty, SUM(l.amount) AS amount
  FROM order_lines l JOIN orders o ON o.id = l.order_id WHERE o.status = 'delivered' GROUP BY 1)
SELECT COUNT(*) AS mismatched
FROM j FULL JOIN l ON l.sku = j.sku
WHERE j.qty IS DISTINCT FROM l.qty OR ABS(COALESCE(j.amount,0) - COALESCE(l.amount,0)) > 0.005;
```

Порядок за користю й ризиком:
1. Аналітика й звіти (продажі по SKU, постачальникам, «Огляд») — SQL замість jsonb.
2. Резервування (`reserve_order_items` читає `jsonb_array_elements` — переписати на
   `order_lines`), планування виконання (`resolveOrderFulfillment`).
3. Відгрузка (`/ship`): чернетка РН будується з `order_lines`, а не з `items`.
4. Облік при доставці вже читає `acc_document_lines` — не чіпати.

Кожен крок — окремий коміт із порівнянням результату старого й нового шляху на
тестовій базі (e2e адмінки + інтеграційні тести вже покривають confirm → ship →
delivered).

### C. Писарі переходять на таблицю; jsonb стає похідним

- 14 місць запису (сайт, кабінет, імпорти Prom/Rozetka/Епіцентр, ручне замовлення,
  редактор рядків, знижка, зміна тарифу) пишуть `order_lines` через один модуль
  `lib/orders/lines.ts` (вставка, заміна, перерахунок total_price).
- Тригер розвертається: `order_lines` → `orders.items` (jsonb як кеш для старих
  читачів і для журналу, де items віддається клієнту одним полем).
- `product_id` лишається необов'язковим (рішення власника 31.10); якщо до того часу
  видалення товарів стане «архівуванням», можна обговорити `NOT NULL`.
- `orders.total_price` рахується тригером із рядків — правило «сума лише з рядків»
  переходить у базу (I10 уже перевіряє це сьогодні).

### D. Прибирання (не раніше ніж через місяць стабільної роботи C)

- jsonb `items` лишається як read-only кеш або видаляється — рішення за фактом:
  якщо всі 39 читачів перейшли, видаляємо.

## Оцінка

| Етап | Обсяг | Ризик для прода |
|---|---|---|
| A | зроблено 31.10.2026 (136) | нульовий (нічого не читає таблицю) |
| B | 3–5 комітів, 1–2 тижні фоном | низький, по одному читачу, відкат — повернути читання jsonb |
| C | 14 писарів через один модуль, 1–2 тижні | середній, тому — у тиху годину, з планом відкату «тригер назад» |
| D | день | низький |

## Рішення власника

1. **Коли починати A** — 31.10.2026: стартувати. Зроблено того ж дня.
2. **Вільні позиції без SKU** — 31.10.2026: дозволити рядок без товару
   (`product_id NULL`). Факти на момент рішення: 1002 рядки в проді, 0 вільних
   (`MANUAL-…`), 1 артикул, видалений з каталогу після продажу.
3. **Момент C** — відкрито: після того як A постоїть у проді без спрацювань I9 і
   картка замовлення звільниться від паралельних правок.
