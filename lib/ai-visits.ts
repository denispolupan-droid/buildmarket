// Запис візитів ШІ-краулерів і переходів з чат-ботів.
//
// Живе окремо від proxy навмисно: proxy має лишатися читабельним списком
// правил маршрутизації, а не місцем, де між авторизацією і рейт-лімітом
// заховався HTTP-виклик у базу.
//
// Пишемо через REST-RPC, а не через supabase-js: proxy виконується на кожен
// запит сайту, і тягнути туди клієнтську бібліотеку заради одного інкремента —
// це вага в бандлі проксі на всьому трафіку, включно з тим, де ботів немає.

const RPC_URL = () => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc`;

/**
 * Розділ сайту для статистики ботів.
 *
 * Групуємо, а не пишемо шлях: див. коментар у міграції 100 — питання «чи бере
 * бот Markdown-версії й чи доходить до товарів» вимагає саме розділу, а повний
 * шлях дав би рядок на кожен товар кожного дня.
 */
export function sectionOf(pathname: string): string {
  const p = pathname.replace(/^\/ru(?=\/|$)/, '') || '/';
  if (p.endsWith('.md')) return 'markdown';
  if (p === '/llms.txt') return 'llms.txt';
  if (p === '/robots.txt' || p === '/sitemap.xml') return 'robots/sitemap';
  if (p === '/') return 'головна';
  if (p.startsWith('/product/')) return 'товар';
  if (p.startsWith('/shop')) return 'категорія';
  if (p.startsWith('/blog')) return 'блог';
  if (p.startsWith('/calculators')) return 'калькулятори';
  return 'інше';
}

async function rpc(fn: string, body: Record<string, string>): Promise<void> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return;
  try {
    await fetch(`${RPC_URL()}/${fn}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        // Відповідь не потрібна — просимо не витрачати трафік на її формування
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
      // Статистика не варта того, щоб через неї підвисав запит користувача
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Мовчки. Лічильник відвідувань — не та річ, заради якої сторінка має
    // впасти або хоч раз віддати 500.
  }
}

// Обидві функції не мають права відхилитися: їх викликає after() у proxy, і
// незловлений reject там — помилка в логах на кожному візиті бота. Тому
// try/catch тут дублює той, що всередині rpc: підготовка аргументів (sectionOf)
// рахується ДО входу в rpc і його захистом не накрита.
export async function recordAiBotHit(bot: string, pathname: string): Promise<void> {
  try {
    await rpc('bump_ai_bot_hit', { p_bot: bot, p_section: sectionOf(pathname) });
  } catch {
    /* статистика мовчить, сайт працює */
  }
}

export async function recordAiReferral(source: string, pathname: string): Promise<void> {
  try {
    await rpc('bump_ai_referral', { p_source: source, p_path: pathname });
  } catch {
    /* статистика мовчить, сайт працює */
  }
}
