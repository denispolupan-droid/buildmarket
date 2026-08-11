import { NextResponse } from 'next/server';
import { getRzToken, getRzSender, isRzDeliveryEnabled } from '../../../../lib/rz-delivery-api';

// Чи показувати «ROZETKA Доставку» в чекауті і до якої ваги.
//
// Стелю задає НАША точка здачі: у Rozetka ліміт є в обох кінців, і навіть якщо
// покупець вибере точку на 500 кг, посилку понад ліміт складу здачі в нас просто
// не приймуть. Тому чекаут питає цю цифру, а не здогадується.
//
// Токен звідси не витікає: віддаємо лише прапорець «налаштовано».

export async function GET() {
  const [token, sender, on] = await Promise.all([getRzToken(), getRzSender(), isRzDeliveryEnabled()]);
  return NextResponse.json({
    enabled:     Boolean(on && token && sender),
    maxWeightKg: sender?.weight_limit_kg ?? null,
    senderPoint: sender?.department_label ?? null,
  });
}
