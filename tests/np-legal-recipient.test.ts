import { describe, it, expect } from 'vitest';
import { normalizeTaxNumber, legalRecipientFromCustomer, taxNumberLabel } from '../lib/np-legal-recipient';

describe('normalizeTaxNumber', () => {
  it('приймає 8 (ЄДРПОУ) і 10 (РНОКПП) цифр, зайве прибирає', () => {
    expect(normalizeTaxNumber('43942149')).toBe('43942149');
    expect(normalizeTaxNumber(' 3198107136 ')).toBe('3198107136');
    expect(normalizeTaxNumber('ЄДРПОУ 439-421-49')).toBe('43942149');
  });
  it('інша довжина або порожньо — null', () => {
    expect(normalizeTaxNumber('1234567')).toBeNull();
    expect(normalizeTaxNumber('123456789')).toBeNull();
    expect(normalizeTaxNumber('')).toBeNull();
    expect(normalizeTaxNumber(null)).toBeNull();
  });
});

describe('legalRecipientFromCustomer', () => {
  it('назва — юридична, інакше компанія; адреса — юридична або null', () => {
    expect(legalRecipientFromCustomer({ legal_name: 'ТОВ «ОК ВДОМА»', company: 'ОК Вдома', tax_number: '43942149', legal_address: ' м. Одеса ' }))
      .toEqual({ legalName: 'ТОВ «ОК ВДОМА»', taxNumber: '43942149', legalAddress: 'м. Одеса' });
    expect(legalRecipientFromCustomer({ company: 'ОК Вдома', tax_number: '43942149' }))
      .toEqual({ legalName: 'ОК Вдома', taxNumber: '43942149', legalAddress: null });
  });
  it('без валідного коду юрособи немає', () => {
    expect(legalRecipientFromCustomer({ legal_name: 'ТОВ X', tax_number: null })).toBeNull();
    expect(legalRecipientFromCustomer({ legal_name: 'ТОВ X', tax_number: '12' })).toBeNull();
    expect(legalRecipientFromCustomer(null)).toBeNull();
  });
});

describe('taxNumberLabel', () => {
  it('8 цифр — ЄДРПОУ, 10 — РНОКПП', () => {
    expect(taxNumberLabel('43942149')).toBe('ЄДРПОУ');
    expect(taxNumberLabel('3198107136')).toBe('РНОКПП');
  });
});
