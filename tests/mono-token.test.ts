import { describe, it, expect, afterEach } from 'vitest';
import { getMonoAcquiringToken } from '../lib/mono-config';

// У змінній оточення реально трапляється BOM або перенос рядка — від копіювання
// з дашборду. Для fetch це не косметика: заголовок із недрукованим символом не
// відправляється взагалі, виклик падає.
//
// Саме через це вебхук Monobank не міг дістати публічний ключ, підпис не
// сходився, і карткові замовлення не створювались зовсім — а інвойси при цьому
// виставлялись, бо там чистка була скопійована. Тепер функція одна на всіх.

const original = process.env.MONOBANK_API_TOKEN;
afterEach(() => { process.env.MONOBANK_API_TOKEN = original; });

describe('getMonoAcquiringToken', () => {
  it('зрізає BOM на початку', () => {
    process.env.MONOBANK_API_TOKEN = '﻿uXQaSz0PVyQmRoOLL';
    expect(getMonoAcquiringToken()).toBe('uXQaSz0PVyQmRoOLL');
  });

  it('зрізає перенос рядка й пробіли', () => {
    process.env.MONOBANK_API_TOKEN = '  uXQaSz0PVyQmRoOLL\n';
    expect(getMonoAcquiringToken()).toBe('uXQaSz0PVyQmRoOLL');
  });

  it('прибирає невидимі символи всередині', () => {
    process.env.MONOBANK_API_TOKEN = 'uXQaSz0​PVyQmRoOLL';
    expect(getMonoAcquiringToken()).toBe('uXQaSz0PVyQmRoOLL');
  });

  it('нормальний токен не чіпає', () => {
    process.env.MONOBANK_API_TOKEN = 'uXQaSz0PVyQmRoOLL';
    expect(getMonoAcquiringToken()).toBe('uXQaSz0PVyQmRoOLL');
  });

  it('без змінної — порожній рядок, а не undefined', () => {
    delete process.env.MONOBANK_API_TOKEN;
    expect(getMonoAcquiringToken()).toBe('');
  });
});
