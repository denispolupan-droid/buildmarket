-- Видимість сайту в ШІ-пошуку: скільки разів прийшли краулери ChatGPT/Gemini/
-- Perplexity і скільки живих людей перейшло з їхніх відповідей.
--
-- Навіщо окремі таблиці, а не аналітика. Google Analytics на сайті мертвий
-- (власний CSP ріже його скрипт), але навіть живий він тут не допоміг би:
-- краулер не виконує JS, тож ЖОДНА клієнтська аналітика ботів не бачить у
-- принципі. Порахувати їх можна лише на сервері, на межі запиту.
--
-- Дві таблиці, а не одна, бо це різні за природою події:
--   ai_bot_hits  — робот прочитав сторінку. Це «нас індексують», покази;
--   ai_referrals — людина побачила нас у відповіді й КЛІКНУЛА. Це вже гроші.
-- Зливати їх в одну означало б рахувати покази й продажі в одній колонці.
--
-- Обидві таблиці — лічильники з UPSERT, а не журнал подій. Обхід каталогу
-- ботом дає тисячі запитів; порядкові логи розпухли б до мільйонів рядків за
-- місяць заради відповіді «скільки разів». Рядок за день × джерело — вистачає.

-- ── Візити ШІ-краулерів ────────────────────────────────────────────────────
-- section, а не повний шлях: знати, ЯКИЙ саме з 3000 товарів прочитав GPTBot,
-- не потрібно нікому, а рядків це дало б стільки ж, скільки товарів × днів.
-- Потрібно інше — чи доходить бот далі головної й чи бере Markdown-версії.
create table if not exists public.ai_bot_hits (
  day      date    not null,
  bot      text    not null,
  section  text    not null,
  hits     integer not null default 0,
  primary key (day, bot, section)
);

create index if not exists ai_bot_hits_day_idx on public.ai_bot_hits (day desc);

alter table public.ai_bot_hits enable row level security;
revoke all on public.ai_bot_hits from anon, authenticated;
grant all on public.ai_bot_hits to service_role;

-- ── Переходи людей з чат-ботів ─────────────────────────────────────────────
-- Тут шлях ПОТРІБЕН повністю: цінність саме в тому, яку сторінку ШІ радить.
-- Рядків мало — це живі люди, а не обхід каталогу.
create table if not exists public.ai_referrals (
  day          date    not null,
  source       text    not null,
  landing_path text    not null,
  hits         integer not null default 0,
  primary key (day, source, landing_path)
);

create index if not exists ai_referrals_day_idx on public.ai_referrals (day desc);

alter table public.ai_referrals enable row level security;
revoke all on public.ai_referrals from anon, authenticated;
grant all on public.ai_referrals to service_role;

-- ── Інкремент ──────────────────────────────────────────────────────────────
-- Дата рахується по Києву, а не в UTC: інакше все після 21:00 (взимку 22:00)
-- лягало б у завтрашній день, і денні графіки в адмінці розходилися б з
-- рештою розділів, де день уже київський.
create or replace function public.bump_ai_bot_hit(p_bot text, p_section text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_bot_hits (day, bot, section, hits)
  values ((now() at time zone 'Europe/Kyiv')::date, p_bot, p_section, 1)
  on conflict (day, bot, section) do update set hits = public.ai_bot_hits.hits + 1;
$$;

create or replace function public.bump_ai_referral(p_source text, p_path text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_referrals (day, source, landing_path, hits)
  values ((now() at time zone 'Europe/Kyiv')::date, p_source, left(p_path, 300), 1)
  on conflict (day, source, landing_path) do update set hits = public.ai_referrals.hits + 1;
$$;

-- Викликає лише proxy сервісним ключем. anon сюди пускати не можна: функція
-- security definer, і відкритий доступ означав би, що будь-хто накрутить
-- лічильники запитом з консолі — звіт перетворився б на фантазію.
revoke execute on function public.bump_ai_bot_hit(text, text) from public, anon, authenticated;
revoke execute on function public.bump_ai_referral(text, text) from public, anon, authenticated;
grant execute on function public.bump_ai_bot_hit(text, text) to service_role;
grant execute on function public.bump_ai_referral(text, text) to service_role;

-- ── Ретенція ───────────────────────────────────────────────────────────────
-- УВАГА при синку на test: там pg_cron не встановлений (`relation "cron.job"
-- does not exist`), тому блок нижче на тесті свідомо пропущено — застосовано
-- 2026-08-19 без нього. Схема таблиць і функцій на обох базах ідентична;
-- розходиться лише прибирання старих рядків, яке тесту й не потрібне.
-- Рік історії: менше не дає порівняти сезон із сезоном, більше не потрібно —
-- склад ШІ-пошуковиків за рік змінюється настільки, що старі цифри вже ні про
-- що не говорять.
select cron.unschedule(jobid) from cron.job where jobname = 'cleanup-ai-visibility';

select cron.schedule(
  'cleanup-ai-visibility',
  '17 4 * * *',
  $$
    delete from public.ai_bot_hits  where day < current_date - interval '365 days';
    delete from public.ai_referrals where day < current_date - interval '365 days';
  $$
);
