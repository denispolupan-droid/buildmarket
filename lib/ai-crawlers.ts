// Єдине джерело правди про ШІ-краулери й переходи з чат-ботів.
//
// Навіщо окремий модуль: список ботів потрібен одразу трьом місцям — robots.txt
// (кого пускаємо), proxy (кого рахуємо) і адмінці (як підписати рядок у таблиці).
// Три копії списку розійшлися б за перший же місяць: бот з'являється в robots,
// але не в статистиці — і ти бачиш «нуль візитів» там, де насправді нема детекту.
//
// ВАЖЛИВО про два різні поняття:
//  • токен robots.txt — рядок, який бот шукає у файлі (`Google-Extended`);
//  • User-Agent — те, чим він реально представляється у запиті.
// У Google і Apple це РІЗНІ речі: `Google-Extended` не існує як User-Agent, це
// лише перемикач «можна брати наш контент для Gemini». Тому в детекті візитів
// такі токени не беруть участі — інакше чекали б трафік, якого не буває.

export type AiBotPurpose =
  | 'search'    // індекс, з якого бот цитує сайт у відповідях — головне для нас
  | 'user'      // разовий похід за посиланням, коли людина попросила відкрити сторінку
  | 'training'  // збір корпусу для навчання моделі
  | 'token';    // тільки директива в robots.txt, реального User-Agent не існує

export type AiBot = {
  /** Токен для robots.txt і ключ у статистиці. */
  id: string;
  /** Підпис у адмінці. */
  label: string;
  /** Підрядок User-Agent (нижнім регістром). Немає — бот не детектується у трафіку. */
  ua: string | null;
  purpose: AiBotPurpose;
};

export const AI_BOTS: AiBot[] = [
  // OpenAI. Для видимості в ChatGPT критичний саме OAI-SearchBot: GPTBot — це
  // навчання, воно на цитування у відповідях напряму не впливає.
  { id: 'OAI-SearchBot',    label: 'ChatGPT (пошук)',    ua: 'oai-searchbot',    purpose: 'search' },
  { id: 'ChatGPT-User',     label: 'ChatGPT (перехід)',  ua: 'chatgpt-user',     purpose: 'user' },
  { id: 'GPTBot',           label: 'OpenAI (навчання)',  ua: 'gptbot',           purpose: 'training' },

  // Perplexity — окремий пошук, який показує джерела списком; для магазину це
  // найкоротший шлях від відповіді до кліку.
  { id: 'PerplexityBot',    label: 'Perplexity (пошук)', ua: 'perplexitybot',    purpose: 'search' },
  { id: 'Perplexity-User',  label: 'Perplexity (перехід)', ua: 'perplexity-user', purpose: 'user' },

  // Google Gemini й AI Overviews беруть контент з основного індексу Googlebot,
  // а Google-Extended лише дозволяє його ТАМ використовувати. Заборониш —
  // випадеш з відповідей Gemini, не втративши позицій у звичайній видачі.
  { id: 'Google-Extended',  label: 'Google Gemini / AI Overviews', ua: null,     purpose: 'token' },

  // Anthropic.
  { id: 'ClaudeBot',        label: 'Claude (індекс)',    ua: 'claudebot',        purpose: 'search' },
  { id: 'Claude-User',      label: 'Claude (перехід)',   ua: 'claude-user',      purpose: 'user' },
  { id: 'Claude-SearchBot', label: 'Claude (пошук)',     ua: 'claude-searchbot', purpose: 'search' },

  // Apple Intelligence / Siri — той самий трюк, що в Google: Applebot ходить
  // завжди, Applebot-Extended вмикає використання в моделях.
  { id: 'Applebot-Extended', label: 'Apple Intelligence', ua: null,              purpose: 'token' },

  { id: 'meta-externalagent', label: 'Meta AI',          ua: 'meta-externalagent', purpose: 'training' },
  { id: 'Amazonbot',        label: 'Amazon (Alexa/Rufus)', ua: 'amazonbot',      purpose: 'search' },
  { id: 'Bytespider',       label: 'ByteDance / Doubao', ua: 'bytespider',       purpose: 'training' },
  { id: 'CCBot',            label: 'Common Crawl',       ua: 'ccbot',            purpose: 'training' },
  { id: 'MistralAI-User',   label: 'Mistral (перехід)',  ua: 'mistralai-user',   purpose: 'user' },
  { id: 'DuckAssistBot',    label: 'DuckDuckGo AI',      ua: 'duckassistbot',    purpose: 'search' },
  { id: 'YouBot',           label: 'You.com',            ua: 'youbot',           purpose: 'search' },
];

/** Боти, яких реально видно у трафіку (мають User-Agent). */
export const DETECTABLE_BOTS = AI_BOTS.filter(b => b.ua) as (AiBot & { ua: string })[];

/**
 * Кого пускаємо, а кого ні (рішення власника, 2026-08-19).
 *
 * Пускаємо все, що веде до цитування нас у відповідях: пошукові індекси
 * (`search`), разові походи за посиланням на прохання людини (`user`) і
 * директиви-вимикачі Google/Apple (`token`).
 *
 * Закриваємо збір корпусу для навчання (`training`). Ключове, чому це НЕ
 * коштує нам видимості: у OpenAI навчальний GPTBot і пошуковий OAI-SearchBot —
 * різні роботи з різними правилами. Заборона першого не прибирає нас із
 * відповідей ChatGPT, бо цитує він з індексу другого. Те саме в Google:
 * ходить Googlebot, а Google-Extended лише дозволяє використання в Gemini.
 */
export const AI_BOT_TOKENS_ALLOWED = AI_BOTS.filter(b => b.purpose !== 'training').map(b => b.id);
export const AI_BOT_TOKENS_TRAINING = AI_BOTS.filter(b => b.purpose === 'training').map(b => b.id);

export function botLabel(id: string): string {
  return AI_BOTS.find(b => b.id === id)?.label ?? id;
}

/**
 * Який ШІ-краулер прийшов, якщо це взагалі він.
 *
 * Порядок перевірки має значення: `Claude-SearchBot` містить у собі… ні, не
 * містить `ClaudeBot` (різні рядки), а от `chatgpt-user` і `gptbot` живуть у
 * різних UA спокійно. Небезпечний кейс один — вкладені підрядки, тому беремо
 * НАЙДОВШИЙ збіг, а не перший-ліпший.
 */
export function detectAiBot(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  let best: { id: string; len: number } | null = null;
  for (const bot of DETECTABLE_BOTS) {
    if (!ua.includes(bot.ua)) continue;
    if (!best || bot.ua.length > best.len) best = { id: bot.id, len: bot.ua.length };
  }
  return best?.id ?? null;
}

// ── Переходи живих людей з чат-ботів ───────────────────────────────────────
// Це протилежний бік монети: бот прийшов і прочитав — тут людина прочитала
// відповідь і КЛІКНУЛА. Саме цей рядок у звіті означає гроші, а не покази.

export type AiReferralSource = {
  id: string;
  label: string;
  /** Домени-джерела (збіг по кінцю хоста, щоб ловити піддомени). */
  hosts: string[];
};

export const AI_REFERRAL_SOURCES: AiReferralSource[] = [
  { id: 'chatgpt',    label: 'ChatGPT',    hosts: ['chatgpt.com', 'chat.openai.com', 'openai.com'] },
  { id: 'perplexity', label: 'Perplexity', hosts: ['perplexity.ai'] },
  { id: 'gemini',     label: 'Gemini',     hosts: ['gemini.google.com', 'bard.google.com'] },
  { id: 'copilot',    label: 'Copilot',    hosts: ['copilot.microsoft.com'] },
  { id: 'claude',     label: 'Claude',     hosts: ['claude.ai'] },
  { id: 'grok',       label: 'Grok',       hosts: ['grok.com', 'x.ai'] },
  { id: 'deepseek',   label: 'DeepSeek',   hosts: ['chat.deepseek.com'] },
  { id: 'mistral',    label: 'Le Chat',    hosts: ['chat.mistral.ai'] },
  { id: 'you',        label: 'You.com',    hosts: ['you.com'] },
];

export function referralLabel(id: string): string {
  return AI_REFERRAL_SOURCES.find(s => s.id === id)?.label ?? id;
}

function sourceByHost(host: string): string | null {
  const h = host.toLowerCase().replace(/^www\./, '');
  for (const s of AI_REFERRAL_SOURCES) {
    if (s.hosts.some(d => h === d || h.endsWith(`.${d}`))) return s.id;
  }
  return null;
}

/**
 * Джерело переходу з чат-бота: спершу Referer, потім utm_source.
 *
 * Обидва шляхи потрібні. ChatGPT додає `?utm_source=chatgpt.com` до посилань,
 * але Referer у нього часто зрізаний до порожнього — покладатися лише на
 * заголовок означає недорахувати більшість переходів. Навпаки теж буває:
 * Perplexity шле нормальний Referer і нічого не дописує в URL.
 */
export function detectAiReferral(
  referer: string | null | undefined,
  utmSource: string | null | undefined,
): string | null {
  if (referer) {
    try {
      const fromRef = sourceByHost(new URL(referer).hostname);
      if (fromRef) return fromRef;
    } catch {
      // сміттєвий Referer — не привід губити перевірку utm нижче
    }
  }
  if (utmSource) {
    const raw = utmSource.trim().toLowerCase();
    // utm_source приходить і доменом ('chatgpt.com'), і назвою ('chatgpt')
    const byHost = sourceByHost(raw);
    if (byHost) return byHost;
    const byId = AI_REFERRAL_SOURCES.find(s => s.id === raw);
    if (byId) return byId.id;
  }
  return null;
}
