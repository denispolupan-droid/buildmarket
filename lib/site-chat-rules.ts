/**
 * Чиста логіка чату сайту для розділу «Чати» (під тести): як назвати розмову
 * в списку і в якому вона стані.
 *
 * Відвідувач анонімний, тому заголовок — його перше повідомлення. Стан:
 *  - resolved — менеджер закрив;
 *  - waiting  — менеджер веде чат (ШІ вимкнено) і останнє змістовне слово за
 *               відвідувачем. Автовідповідь-заглушка «Менеджер вже підключився…»
 *               пишеться від імені assistant на КОЖНЕ повідомлення, тож її
 *               ігноруємо, інакше «чекає відповіді» не бувало б ніколи;
 *  - ai       — ШІ відповідає сам;
 *  - answered — менеджер відповів останнім.
 */

export type SiteChatMessageLite = { role: string; content: string };

/** Службові відповіді, які вставляє /api/chat замість живої відповіді. */
const STUB_PATTERNS = [
  /^Менеджер вже підключився до розмови/i,
  /^Зараз AI-помічник недоступний/i,
];

export function isStubReply(m: SiteChatMessageLite): boolean {
  return m.role !== 'user' && STUB_PATTERNS.some(re => re.test(m.content.trim()));
}

export function siteChatTitle(messages: SiteChatMessageLite[], max = 70): string {
  const first = messages.find(m => m.role === 'user')?.content.replace(/\s+/g, ' ').trim();
  if (!first) return 'Відвідувач сайту';
  return first.length > max ? first.slice(0, max - 1) + '…' : first;
}

export function siteChatState(
  session: { status: string; ai_enabled: boolean | null },
  messagesChrono: SiteChatMessageLite[],
): 'waiting' | 'answered' | 'resolved' | 'ai' {
  if (session.status === 'resolved') return 'resolved';
  if (session.ai_enabled ?? true) return 'ai';
  for (let i = messagesChrono.length - 1; i >= 0; i--) {
    const m = messagesChrono[i];
    if (isStubReply(m) || !m.content.trim()) continue;
    return m.role === 'user' ? 'waiting' : 'answered';
  }
  return 'answered';
}

/** Останнє повідомлення для прев'ю: заглушки пропускаємо, щоб не показувати «Менеджер вже підключився…» як останнє слово. */
export function siteChatPreview(messagesChrono: SiteChatMessageLite[], max = 120): string {
  for (let i = messagesChrono.length - 1; i >= 0; i--) {
    const m = messagesChrono[i];
    if (isStubReply(m)) continue;
    const t = m.content.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const prefix = m.role === 'user' ? '' : 'Ми: ';
    const body = prefix + t;
    return body.length > max ? body.slice(0, max - 1) + '…' : body;
  }
  return '';
}
