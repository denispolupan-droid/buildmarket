import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../../lib/auth-guard';
import { fetchAllRows } from '../../../../../lib/db-paginate';
import { AI_BOTS } from '../../../../../lib/ai-crawlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Дані вкладки «ШІ» розділу SEO: хто з ШІ-краулерів нас читає і скільки людей
// прийшло з відповідей чат-ботів. Джерело — ai_bot_hits / ai_referrals, які
// наповнює proxy (див. lib/ai-visits.ts).
//
// Порівняння з попереднім періодом тут не косметика: абсолютна цифра «140
// візитів GPTBot» не означає нічого, поки не видно, було їх учора 20 чи 400.

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type BotRow = { day: string; bot: string; section: string; hits: number };
type RefRow = { day: string; source: string; landing_path: string; hits: number };

/** Дата в Києві — тією ж логікою, що пише лічильники (див. міграцію 100). */
function kyivToday(): Date {
  const now = new Date();
  const kyiv = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
  return new Date(Date.UTC(kyiv.getFullYear(), kyiv.getMonth(), kyiv.getDate()));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

function shift(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

const sum = (rows: { hits: number }[]) => rows.reduce((s, r) => s + r.hits, 0);

function groupSum<T extends { hits: number }>(rows: T[], key: (r: T) => string) {
  const map = new Map<string, number>();
  for (const r of rows) map.set(key(r), (map.get(key(r)) ?? 0) + r.hits);
  return map;
}

export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days') ?? 28), 1), 365);
  const today = kyivToday();
  const from = shift(today, -(days - 1));
  const prevFrom = shift(from, -days);

  // Тягнемо разом поточний і попередній період — один прохід замість двох
  // запитів по тій самій таблиці.
  const [botRows, refRows] = await Promise.all([
    fetchAllRows<BotRow>((a, b) =>
      service.from('ai_bot_hits')
        .select('day, bot, section, hits')
        .gte('day', iso(prevFrom))
        .lte('day', iso(today))
        .range(a, b),
    ),
    fetchAllRows<RefRow>((a, b) =>
      service.from('ai_referrals')
        .select('day, source, landing_path, hits')
        .gte('day', iso(prevFrom))
        .lte('day', iso(today))
        .range(a, b),
    ),
  ]);

  const inCurrent = (day: string) => day >= iso(from);
  const botsCur = botRows.filter(r => inCurrent(r.day));
  const botsPrev = botRows.filter(r => !inCurrent(r.day));
  const refsCur = refRows.filter(r => inCurrent(r.day));
  const refsPrev = refRows.filter(r => !inCurrent(r.day));

  const prevByBot = groupSum(botsPrev, r => r.bot);
  const prevBySource = groupSum(refsPrev, r => r.source);

  // Боти: сумарно за період + розклад по розділах сайту
  const bySections = new Map<string, Map<string, number>>();
  for (const r of botsCur) {
    const inner = bySections.get(r.bot) ?? new Map<string, number>();
    inner.set(r.section, (inner.get(r.section) ?? 0) + r.hits);
    bySections.set(r.bot, inner);
  }

  const bots = [...groupSum(botsCur, r => r.bot).entries()]
    .map(([bot, hits]) => ({
      bot,
      hits,
      prev: prevByBot.get(bot) ?? 0,
      purpose: AI_BOTS.find(b => b.id === bot)?.purpose ?? 'search',
      sections: [...(bySections.get(bot) ?? new Map()).entries()]
        .map(([section, n]) => ({ section, hits: n as number }))
        .sort((a, b) => b.hits - a.hits),
    }))
    .sort((a, b) => b.hits - a.hits);

  const referrals = [...groupSum(refsCur, r => r.source).entries()]
    .map(([source, hits]) => ({ source, hits, prev: prevBySource.get(source) ?? 0 }))
    .sort((a, b) => b.hits - a.hits);

  // Ключ через JSON, а не конкатенацію: шлях може містити будь-що, і склеєний
  // роздільником рядок довелося б розбирати назад із здогадками.
  const landings = [...groupSum(refsCur, r => JSON.stringify([r.source, r.landing_path])).entries()]
    .map(([key, hits]) => {
      const [source, path] = JSON.parse(key) as [string, string];
      return { source, path, hits };
    })
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 100);

  // Денний ряд для графіка: нулі теж потрібні — провал у зборі даних інакше
  // виглядав би як рівна лінія, а не як діра.
  const botsByDay = groupSum(botsCur, r => r.day);
  const refsByDay = groupSum(refsCur, r => r.day);
  const series: { day: string; bots: number; referrals: number }[] = [];
  for (let d = new Date(from); iso(d) <= iso(today); d = shift(d, 1)) {
    series.push({ day: iso(d), bots: botsByDay.get(iso(d)) ?? 0, referrals: refsByDay.get(iso(d)) ?? 0 });
  }

  return NextResponse.json({
    window: { from: iso(from), to: iso(today), days },
    totals: {
      bots: sum(botsCur),
      botsPrev: sum(botsPrev),
      referrals: sum(refsCur),
      referralsPrev: sum(refsPrev),
    },
    bots,
    referrals,
    landings,
    series,
  });
}
