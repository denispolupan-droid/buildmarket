/**
 * Одержувач-юрособа для накладної Нової Пошти.
 *
 * НП заводить юрособу-одержувача за кодом ЄДРПОУ (8 цифр) або РНОКПП ФОП
 * (10 цифр) — назву вона бере зі свого реєстру, а не з нашого поля. Нам
 * потрібні лише код і назва для підказки менеджеру; беремо їх із картки
 * контрагента (customers.tax_number / legal_name / company), як і в рахунку
 * на підприємство (lib/invoice-buyer). Функції чисті — щоб покрити тестами
 * й не дублювати перевірку коду в модалці та в роуті.
 */

export type LegalRecipient = {
  legalName: string;
  /** Лише цифри: 8 (ЄДРПОУ) або 10 (РНОКПП ФОП) */
  taxNumber: string;
  legalAddress: string | null;
};

type CustomerLike = {
  company?: string | null;
  legal_name?: string | null;
  tax_number?: string | null;
  legal_address?: string | null;
} | null | undefined;

/** Код з картки → лише цифри; не 8 і не 10 знаків — null (НП такий відхилить). */
export function normalizeTaxNumber(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length === 8 || digits.length === 10 ? digits : null;
}

/** Юрособа з картки контрагента або null, якщо коду немає чи він невалідний. */
export function legalRecipientFromCustomer(c: CustomerLike): LegalRecipient | null {
  const taxNumber = normalizeTaxNumber(c?.tax_number);
  if (!taxNumber) return null;
  const legalName = (c?.legal_name || c?.company || '').trim();
  return { legalName, taxNumber, legalAddress: c?.legal_address?.trim() || null };
}

/** Підпис коду за довжиною: 8 — ЄДРПОУ, 10 — РНОКПП (ФОП). */
export function taxNumberLabel(taxNumber: string): string {
  return taxNumber.length === 10 ? 'РНОКПП' : 'ЄДРПОУ';
}
