import { describe, it, expect, vi } from 'vitest';

// Модуль тягне клієнт Supabase і API площадок (env при імпорті); тестуємо лише чисту частину
vi.mock('../lib/supabase', () => ({ createServiceClient: () => ({}) }));
vi.mock('../lib/rozetka-api', () => ({ getRozetkaChats: vi.fn() }));
vi.mock('../lib/prom-api', () => ({ getPromChatRooms: vi.fn() }));
vi.mock('../lib/marketplace-chat-seen', () => ({ loadChatSeen: vi.fn(), isChatUnread: vi.fn(), markChatSeen: vi.fn() }));
vi.mock('../lib/marketplace-chat-thread', () => ({ loadMarketplaceThread: vi.fn() }));

import { settleUnread, type MarketplaceChatItem } from '../lib/marketplace-chat-inbox';
import type { MarketplaceChatMessage } from '../lib/marketplace-chat-thread';

const item = (over: Partial<MarketplaceChatItem>): MarketplaceChatItem => ({
  mp: 'rozetka', id: '1', subject: 'Чат', contact: null, updatedAt: '2026-10-13 09:00:00',
  unread: 1, orderNumber: null, ourOrderId: null, receiverId: null, ...over,
});
const buyer = (body = 'Де моє замовлення?'): MarketplaceChatMessage => ({ body, at: '2026-10-13 09:00:00', fromUs: false, author: 'Покупець' });
const us    = (body = 'Відправили сьогодні'): MarketplaceChatMessage => ({ body, at: '2026-10-13 09:05:00', fromUs: true, author: 'Ми' });
const system = (): MarketplaceChatMessage => ({ body: 'Статус змінено', at: '2026-10-13 09:06:00', fromUs: false, author: 'Система' });

describe('settleUnread', () => {
  it('свіжий чат, де останнє слово за покупцем, лишається непрочитаним', async () => {
    const items = [item({ id: 'a' })];
    const markSeen = vi.fn(async () => {});
    await settleUnread(items, { loadThread: async () => ({ messages: [us(), buyer()] }), markSeen });
    expect(items[0].unread).toBe(1);
    expect(markSeen).not.toHaveBeenCalled();
  });

  it('свіжий чат, де ми відповіли останніми (з адмінки чи кабінету), гасне й позначається переглянутим', async () => {
    const items = [item({ id: 'a', mp: 'prom', updatedAt: '2026-10-13T09:05:00' })];
    const markSeen = vi.fn(async () => {});
    await settleUnread(items, { loadThread: async () => ({ messages: [buyer(), us()] }), markSeen });
    expect(items[0].unread).toBe(0);
    expect(markSeen).toHaveBeenCalledWith('prom', 'a', '2026-10-13T09:05:00');
  });

  it('сервісне повідомлення Rozetka після нашої відповіді не робить чат непрочитаним', async () => {
    const items = [item({ id: 'a' })];
    await settleUnread(items, { loadThread: async () => ({ messages: [buyer(), us(), system()] }), markSeen: async () => {} });
    expect(items[0].unread).toBe(0);
  });

  it('тред тягнеться лише для свіжих чатів і не більше ліміту', async () => {
    const items = [item({ id: 'a', unread: 0 }), item({ id: 'b' }), item({ id: 'c' })];
    const loadThread = vi.fn(async () => ({ messages: [buyer()] }));
    await settleUnread(items, { loadThread, markSeen: async () => {}, limit: 1 });
    expect(loadThread).toHaveBeenCalledTimes(1);
    expect(loadThread).toHaveBeenCalledWith('rozetka', 'b');
    expect(items[2].unread).toBe(1); // поза лімітом — лишається підсвіченим
  });

  it('помилка площадки лишає чат підсвіченим', async () => {
    const items = [item({ id: 'a' })];
    await settleUnread(items, { loadThread: async () => { throw new Error('503'); }, markSeen: async () => {} });
    expect(items[0].unread).toBe(1);
  });
});
