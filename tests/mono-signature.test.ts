import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';
import { verifyMonoSignature } from '../lib/mono-signature';

// Генеруємо тестову RSA-пару (як у monobank: публічний ключ — DER SPKI у base64).
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pubKeyB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

function sign(body: string): string {
  return crypto
    .sign('SHA256', Buffer.from(body), { key: privateKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING })
    .toString('base64');
}

describe('verifyMonoSignature', () => {
  const body = JSON.stringify({ invoiceId: 'abc', status: 'success', amount: 12300 });

  it('приймає коректний підпис', () => {
    expect(verifyMonoSignature(body, sign(body), pubKeyB64)).toBe(true);
  });

  it('відхиляє підмінене тіло (payment tampering)', () => {
    const goodSig = sign(body);
    const tampered = JSON.stringify({ invoiceId: 'abc', status: 'success', amount: 999999 });
    expect(verifyMonoSignature(tampered, goodSig, pubKeyB64)).toBe(false);
  });

  it('відхиляє підпис, зроблений чужим ключем', () => {
    const attacker = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const forged = crypto
      .sign('SHA256', Buffer.from(body), { key: attacker.privateKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING })
      .toString('base64');
    expect(verifyMonoSignature(body, forged, pubKeyB64)).toBe(false);
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
