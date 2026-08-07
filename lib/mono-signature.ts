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

    const data = Buffer.from(body);
    const signature = Buffer.from(signatureB64, 'base64');

    // ECDSA-підпис буває у двох кодуваннях: DER (за замовчуванням у Node) і
    // «сирий» r‖s (IEEE P1363). Яке саме шле площадка — ззовні не видно, а
    // помилка виглядає однаково: тихе false і 401 на кожен вебхук. Тому пробуємо
    // обидва: зайва перевірка коштує мікросекунди, мовчазна втрата оплати — ні.
    for (const dsaEncoding of ['der', 'ieee-p1363'] as const) {
      if (crypto.verify('SHA256', data, { key: pubKey, dsaEncoding }, signature)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
