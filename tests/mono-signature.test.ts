import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';
import { verifyMonoSignature } from '../lib/mono-signature';

// Фікстура повторює ФОРМАТ MONOBANK, а не наш код: ключ ECDSA prime256v1,
// відданий як base64 від PEM-тексту, підпис — ECDSA/SHA-256.
//
// Попередня версія цих тестів будувала RSA-пару й base64 від сирого DER — рівно
// так, як (помилково) читав наш код. Тести були зелені, а в проді кожен вебхук
// отримував 401 і жодне карткове замовлення не створювалось. Тому фікстура тепер
// зафіксована за реальним форматом площадки.
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pubKeyB64 = Buffer.from(publicKey.export({ type: 'spki', format: 'pem' }) as string).toString('base64');

function sign(body: string, key: crypto.KeyObject = privateKey): string {
  return crypto.sign('SHA256', Buffer.from(body), key).toString('base64');
}

describe('verifyMonoSignature', () => {
  const body = JSON.stringify({ invoiceId: 'abc', status: 'success', amount: 12300 });

  it('приймає коректний підпис (ECDSA + base64(PEM), як віддає monobank)', () => {
    expect(verifyMonoSignature(body, sign(body), pubKeyB64)).toBe(true);
  });

  it('розуміє й сирий DER — на випадок зміни формату ключа', () => {
    const derB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    expect(verifyMonoSignature(body, sign(body), derB64)).toBe(true);
  });

  it('приймає й «сирий» підпис r‖s (IEEE P1363), не лише DER', () => {
    const raw = crypto.sign('SHA256', Buffer.from(body), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64');
    expect(verifyMonoSignature(body, raw, pubKeyB64)).toBe(true);
  });

  it('відхиляє підмінене тіло (payment tampering)', () => {
    const goodSig = sign(body);
    const tampered = JSON.stringify({ invoiceId: 'abc', status: 'success', amount: 999999 });
    expect(verifyMonoSignature(tampered, goodSig, pubKeyB64)).toBe(false);
  });

  it('відхиляє підпис, зроблений чужим ключем', () => {
    const attacker = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    expect(verifyMonoSignature(body, sign(body, attacker.privateKey), pubKeyB64)).toBe(false);
  });

  it('відхиляє відсутній підпис або ключ', () => {
    expect(verifyMonoSignature(body, null, pubKeyB64)).toBe(false);
    expect(verifyMonoSignature(body, sign(body), null)).toBe(false);
    expect(verifyMonoSignature(body, '', pubKeyB64)).toBe(false);
  });

  it('відхиляє сміття замість підпису без винятку', () => {
    expect(verifyMonoSignature(body, 'not-base64-!!!', pubKeyB64)).toBe(false);
    expect(verifyMonoSignature(body, sign(body), 'garbage')).toBe(false);
  });
});
