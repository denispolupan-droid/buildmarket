import { describe, it, expect } from 'vitest';
import { siteChatTitle, siteChatState, siteChatPreview, isStubReply } from '../lib/site-chat-rules';

const u = (content: string) => ({ role: 'user', content });
const a = (content: string) => ({ role: 'assistant', content });
const STUB = 'Менеджер вже підключився до розмови — відповість найближчим часом.';

describe('site-chat-rules', () => {
  it('заголовок — перше повідомлення відвідувача, довге обрізається', () => {
    expect(siteChatTitle([a('Вітаю!'), u('Чи є CT 17 у наявності?')])).toBe('Чи є CT 17 у наявності?');
    expect(siteChatTitle([u('a'.repeat(100))], 10)).toBe('aaaaaaaaa…');
    expect(siteChatTitle([a('Вітаю!')])).toBe('Відвідувач сайту');
  });

  it('заглушка розпізнається лише від asistant', () => {
    expect(isStubReply(a(STUB))).toBe(true);
    expect(isStubReply(u(STUB))).toBe(false);
    expect(isStubReply(a('Так, є в наявності'))).toBe(false);
  });

  it('стан: вирішено / веде ШІ / чекає / відповіли', () => {
    expect(siteChatState({ status: 'resolved', ai_enabled: false }, [u('?')])).toBe('resolved');
    expect(siteChatState({ status: 'open', ai_enabled: true }, [u('?'), a('Відповідь ШІ')])).toBe('ai');
    expect(siteChatState({ status: 'open', ai_enabled: null }, [u('?')])).toBe('ai');
    // менеджер веде: на кожне повідомлення відвідувача лягає заглушка — її ігноруємо
    expect(siteChatState({ status: 'open', ai_enabled: false }, [u('Де замовлення?'), a(STUB)])).toBe('waiting');
    expect(siteChatState({ status: 'open', ai_enabled: false }, [u('Де замовлення?'), a(STUB), a('Відправили сьогодні')])).toBe('answered');
  });

  it('прев\'ю пропускає заглушку і підписує наші репліки', () => {
    expect(siteChatPreview([u('Де замовлення?'), a(STUB)])).toBe('Де замовлення?');
    expect(siteChatPreview([u('Де замовлення?'), a('Відправили')])).toBe('Ми: Відправили');
    expect(siteChatPreview([])).toBe('');
  });
});
