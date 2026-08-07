import * as crypto from 'crypto';

// Перевірка підпису вебхука monobank.
//
// Monobank віддає ключ у /api/merchant/pubkey як base64 від PEM-тексту
// («-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE…»), а сам
// ключ — ECDSA prime256v1, і підпис у заголовку X-Sign теж ECDSA/SHA-256.
//
// Раніше тут стояв розбір base64 як «сирого DER» плюс RSA-PSS. Через це
// createPublicKey падав ще на розборі («Failed to read asymmetric key»), функція
// ловила виняток і завжди повертала false — тобто КОЖЕН вебхук отримував 401, і
// жодне карткове замовлення не створювалося з моменту запуску. Тести цього не
// ловили, бо будували фікстуру тим самим хибним способом: RSA + сирий DER.
//
// Чиста функція без мережі (ключ передається ззовні) — щоб логіку можна було
// покрити тестами. Повертає true лише коли підпис справді відповідає тілу і ключу.
export function verifyMonoSignature(
  body: string,
  signatureB64: string | null | undefined,
  pubKeyB64: string | null | undefined,
): boolean {
  if (!signatureB64 || !pubKeyB64) return false;
  try {
    const decoded = Buffer.from(pubKeyB64, 'base64');
    const asText = decoded.toString('utf8');
    // PEM — поточний формат Monobank; сирий DER лишаємо як запасний варіант,
    // щоб зміна формату на їхньому боці не поклала прийом оплат мовчки.
    const pubKey = asText.includes('BEGIN PUBLIC KEY')
      ? crypto.createPublicKey(asText)
      : crypto.createPublicKey({ key: decoded, format: 'der', type: 'spki' });

    return crypto.verify('SHA256', Buffer.from(body), pubKey, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}
