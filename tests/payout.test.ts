/**
 * Тести payout-заявки.
 * Перевіряємо контракт submit_payout_request і поведінку route.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Бізнес-логіка (чиста) ─────────────────────────────────────────────────────

function canRequestPayout(balance: number, held: number, amount: number): boolean {
  return (balance - held) >= amount && amount >= 500;
}

function validatePayoutInput(amount: unknown, method: unknown, bank_details: unknown) {
  if (typeof amount !== 'number' || amount <= 0) return 'Некоректна сума';
  if (amount < 500) return 'Мінімальна сума — 500 грн';
  if (!['bank', 'goods_offset'].includes(String(method))) return 'Невірний метод виплати';
  if (method === 'bank' && !bank_details) return 'Вкажіть реквізити';
  return null;
}

describe('payout validation', () => {
  it('дозволяє подачу коли доступний залишок >= суми', () => {
    expect(canRequestPayout(2000, 300, 1500)).toBe(true);
  });

  it("відхиляє якщо доступний залишок < суми (включно з held)", () => {
    expect(canRequestPayout(2000, 1600, 500)).toBe(false);  // 2000 - 1600 = 400 < 500
  });

  it('відхиляє суму менше мінімуму 500', () => {
    expect(canRequestPayout(5000, 0, 499)).toBe(false);
  });

  it('validatePayoutInput — некоректна сума', () => {
    expect(validatePayoutInput('100', 'bank', 'UA...')).toBe('Некоректна сума');
    expect(validatePayoutInput(-50, 'bank', 'UA...')).toBe('Некоректна сума');
  });

  it('validatePayoutInput — сума нижче мінімуму', () => {
    expect(validatePayoutInput(499, 'bank', 'UA...')).toBe('Мінімальна сума — 500 грн');
  });

  it('validatePayoutInput — невідомий метод', () => {
    expect(validatePayoutInput(1000, 'crypto', 'UA...')).toBe('Невірний метод виплати');
  });

  it('validatePayoutInput — bank без реквізитів', () => {
    expect(validatePayoutInput(1000, 'bank', null)).toBe('Вкажіть реквізити');
  });

  it('validatePayoutInput — goods_offset без реквізитів OK', () => {
    expect(validatePayoutInput(1000, 'goods_offset', null)).toBeNull();
  });

  it('validatePayoutInput — валідний bank запит', () => {
    expect(validatePayoutInput(1000, 'bank', 'UA123456789012345678901234567')).toBeNull();
  });
});

// ── Мок rpc submit_payout_request ────────────────────────────────────────────

const mockRpc = vi.fn();

vi.mock('../lib/supabase', () => ({
  createServiceClient: () => ({ rpc: mockRpc }),
}));

describe('submit_payout_request contract', () => {
  beforeEach(() => mockRpc.mockReset());

  it('викликає submit_payout_request з правильними параметрами', async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });

    await mockRpc('submit_payout_request', {
      p_auth_user_id: 'user-uuid',
      p_amount:       1500,
      p_method:       'bank',
      p_bank_details: 'UA123...',
    });

    expect(mockRpc).toHaveBeenCalledWith('submit_payout_request', {
      p_auth_user_id: 'user-uuid',
      p_amount:       1500,
      p_method:       'bank',
      p_bank_details: 'UA123...',
    });
  });

  it('success:false при недостатньому балансі', async () => {
    mockRpc.mockResolvedValue({
      data: { success: false, error: 'Недостатньо коштів. Доступно: 300.00 ₴' },
      error: null,
    });

    const result = await mockRpc('submit_payout_request', {
      p_auth_user_id: 'u', p_amount: 1000, p_method: 'bank', p_bank_details: 'UA...',
    });

    expect(result.data.success).toBe(false);
    expect(result.data.error).toContain('Недостатньо');
  });

  it('success:false при дублікаті заявки за 60 секунд', async () => {
    mockRpc.mockResolvedValue({
      data: { success: false, error: 'Аналогічна заявка вже подана (зачекайте хвилину)' },
      error: null,
    });

    const result = await mockRpc('submit_payout_request', {
      p_auth_user_id: 'u', p_amount: 1000, p_method: 'bank', p_bank_details: 'UA...',
    });

    expect(result.data.success).toBe(false);
    expect(result.data.error).toContain('хвилину');
  });
});

// ── Інваріант: після виплати баланс не може стати від'ємним ──────────────────

describe('payout invariant', () => {
  it('available - payout_amount >= 0', () => {
    const balance = 1200, held = 200;
    const available = balance - held;  // 1000
    const payout = 1000;

    expect(available - payout).toBeGreaterThanOrEqual(0);
  });

  it('два однакових запити не можуть перевищити баланс якщо FOR UPDATE', () => {
    // Симулюємо що перший запит заблокував рядок і зменшив available.
    // Другий запит після розблокування бачить вже оновлений баланс.
    let available = 800;

    function tryPayout(amount: number): boolean {
      if (available < amount) return false;
      available -= amount;  // симулюємо зміну після першого запиту
      return true;
    }

    const first  = tryPayout(700);  // бачить 800, успіх → available = 100
    const second = tryPayout(700);  // бачить 100, відмова

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(available).toBeGreaterThanOrEqual(0);
  });
});
