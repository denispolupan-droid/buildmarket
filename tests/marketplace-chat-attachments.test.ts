import { describe, it, expect } from 'vitest';
import { rozetkaAttachments, promAttachments } from '../lib/marketplace-chat-thread';
import { awaitingOurReply, buildTranscript } from '../lib/marketplace-chat-draft-rules';
import type { MarketplaceChatMessage } from '../lib/marketplace-chat-thread';

// 17.10.2026: фото покупців не показувались — Rozetka віддає лише id файлу,
// Prom — посилання, що відкривається тільки з нашим токеном; повідомлення
// «лише фото» без тексту зникали з треда, і помічник вважав, що відповідати нема на що.
describe('rozetkaAttachments', () => {
  it('IMG → фото через проксі, решта → файл', () => {
    expect(rozetkaAttachments([
      { id: 2312951, name: 'photo.jpg', size: 61145, typeName: 'IMG' },
      { id: 7, name: 'act.pdf', typeName: 'DOC' },
    ])).toEqual([
      { kind: 'image', name: 'photo.jpg', url: '/api/admin/marketplace-chats/file?mp=rozetka&id=2312951', size: 61145 },
      { kind: 'file', name: 'act.pdf', url: '/api/admin/marketplace-chats/file?mp=rozetka&id=7', size: null },
    ]);
    expect(rozetkaAttachments(null)).toEqual([]);
  });
});

describe('promAttachments', () => {
  it('вкладення за uid через проксі; чужий/кривий uid відкидається', () => {
    const a = promAttachments({
      type: 'attachment',
      attachments: [
        { attachment_uid: '2bcbb66a-1bbb-4183-befe-f2ba6741c229', attachment_name: 'p.jpg', attachment_type: 'IMAGE', attachment_size: 10 },
        { attachment_uid: '../../etc', attachment_name: 'x' },
      ],
    });
    expect(a).toEqual([{ kind: 'image', name: 'p.jpg', url: '/api/admin/marketplace-chats/file?mp=prom&uid=2bcbb66a-1bbb-4183-befe-f2ba6741c229', size: 10 }]);
  });
  it('context — картка товару лише з images.prom.ua', () => {
    expect(promAttachments({ type: 'context', context_item_image_url: 'https://images.prom.ua/1_w80.jpg' })[0].kind).toBe('product');
    expect(promAttachments({ type: 'context', context_item_image_url: 'https://evil.example/1.jpg' })).toEqual([]);
  });
});

const photoOnly: MarketplaceChatMessage = {
  body: '', at: '2026-10-17 06:56:46', fromUs: false, author: 'Олена',
  attachments: [{ kind: 'image', name: 'p.jpg', url: '/x' }, { kind: 'image', name: 'q.jpg', url: '/y' }],
};

describe('фото як зміст повідомлення', () => {
  it('«лише фото» від покупця після нашої відповіді — чекає відповіді', () => {
    expect(awaitingOurReply([{ body: 'Дякуємо', at: '1', fromUs: true, author: 'Ми' }, photoOnly])).toBe(true);
  });
  it('картка товару сама по собі не вважається зверненням', () => {
    const ctx: MarketplaceChatMessage = { body: '', at: '2', fromUs: false, author: 'Олена', attachments: [{ kind: 'product', name: 't', url: 'https://images.prom.ua/1.jpg' }] };
    expect(awaitingOurReply([{ body: 'Дякуємо', at: '1', fromUs: true, author: 'Ми' }, ctx])).toBe(false);
  });
  it('транскрипт для моделі каже, що надіслано фото', () => {
    expect(buildTranscript([photoOnly])).toContain('надіслано фото/файлів: 2');
  });
});
