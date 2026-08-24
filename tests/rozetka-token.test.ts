import { describe, it, expect } from 'vitest';
import { isInvalidTokenError } from '../lib/rozetka-api';

// Форма відповіді знята з живого виклику 24.08: Rozetka повідомляє про мертвий
// токен HTTP-кодом 200 і конвертом success:false — саме тому ретрай по 401 його
// не бачив, і синк замовлень падав до кінця 22-годинного кешу токена.
describe('isInvalidTokenError', () => {
  it('ловить живу відповідь Rozetka з кодом 1020', () => {
    expect(isInvalidTokenError({
      success: false,
      errors: { message: 'incorrect_access_token', code: 1020, description: 'Невірний токен доступу', details: null },
    })).toBe(true);
  });

  it('ловить і за текстом, якщо код не прийшов', () => {
    expect(isInvalidTokenError({ success: false, errors: { description: 'Невірний токен доступу' } })).toBe(true);
    expect(isInvalidTokenError({ success: false, message: 'Invalid access token' })).toBe(true);
    expect(isInvalidTokenError({ success: false, errors: { message: 'incorrect_access_token' } })).toBe(true);
  });

  it('не плутає з іншими відмовами — інакше на кожну помилку логінились би заново', () => {
    expect(isInvalidTokenError({ success: false, errors: { code: 1043, description: 'Замовлення не знайдено' } })).toBe(false);
    expect(isInvalidTokenError({ success: false, message: 'Невірний статус замовлення' })).toBe(false);
  });

  it('успішну відповідь не чіпає', () => {
    expect(isInvalidTokenError({ success: true, content: { orders: [] } })).toBe(false);
  });

  it('сміття не валить', () => {
    expect(isInvalidTokenError(null)).toBe(false);
    expect(isInvalidTokenError(undefined)).toBe(false);
    expect(isInvalidTokenError('текст')).toBe(false);
    expect(isInvalidTokenError({})).toBe(false);
  });
});
