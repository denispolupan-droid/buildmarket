import * as crypto from 'crypto';

// Перевірка підпису вебхука monobank: RSA-PSS + SHA256, публічний ключ — base64(DER, SPKI).
// Чиста функція без мережі (ключ передається ззовні) — щоб логіку можна було покрити тестами.
// Повертає true лише коли підпис справді відповідає тілу і ключу.
export function verifyMonoSignature(
  body: string,
  signatureB64: string | null | undefined,
  pubKeyB64: string | null | undefined,
): boolean {
  if (!signatureB64 || !pubKeyB64) return false;
  try {
    const pubKeyDer = Buffer.from(pubKeyB64, 'base64');
    const pubKey = crypto.createPublicKey({ key: pubKeyDer, format: 'der', type: 'spki' });
    return crypto.verify(
      'SHA256',
      Buffer.from(body),
      { key: pubKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING },
      Buffer.from(signatureB64, 'base64'),
    );
  } catch {
    return false;
  }
}
