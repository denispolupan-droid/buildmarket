import { describe, it, expect } from 'vitest';
import { phoneInputDigits, phoneInputFormat, isCompletePhoneInput } from '../lib/notify/phone';

describe('phoneInputDigits', () => {
  it('приводить будь-яке написання до національних цифр', () => {
    expect(phoneInputDigits('380671234567')).toBe('0671234567');
    expect(phoneInputDigits('+380671234567')).toBe('0671234567');
    expect(phoneInputDigits('38 067 123 45 67')).toBe('0671234567');
    expect(phoneInputDigits('0671234567')).toBe('0671234567');
    expect(phoneInputDigits('671234567')).toBe('0671234567');
    expect(phoneInputDigits('+38 (067) 123-45-67')).toBe('0671234567');
  });

  it('порожній ввід — порожній результат', () => {
    expect(phoneInputDigits('')).toBe('');
    expect(phoneInputDigits('   ')).toBe('');
    // «+38 (» — це вже початок набору: код країни відкинуто, лишається нуль,
    // з якого маска добудовується далі. Порожнім він стає лише коли стерти й його.
    expect(phoneInputDigits('+38 (')).toBe('0');
    expect(phoneInputDigits('+38 (0')).toBe('0');
  });
});

describe('phoneInputFormat', () => {
  it('добудовує маску по мірі набору', () => {
    expect(phoneInputFormat('')).toBe('');
    expect(phoneInputFormat('05')).toBe('+38 (05');
    expect(phoneInputFormat('050')).toBe('+38 (050');
    expect(phoneInputFormat('050671')).toBe('+38 (050) 671');
    expect(phoneInputFormat('05067179')).toBe('+38 (050) 671-79');
    expect(phoneInputFormat('0506717934')).toBe('+38 (050) 671-79-34');
  });

  it('зайві цифри відкидає — довшого за 10 національних не буває', () => {
    expect(phoneInputFormat('05067179341234')).toBe('+38 (050) 671-79-34');
  });

  it('формат стабільний: розібрати відформатоване й зібрати назад — те саме', () => {
    const once = phoneInputFormat(phoneInputDigits('380506717934'));
    expect(phoneInputFormat(phoneInputDigits(once))).toBe(once);
  });
});

describe('isCompletePhoneInput', () => {
  it('повний номер і порожнє поле — ок, недобраний — ні', () => {
    expect(isCompletePhoneInput('+38 (050) 671-79-34')).toBe(true);
    expect(isCompletePhoneInput('380506717934')).toBe(true);
    expect(isCompletePhoneInput('')).toBe(true);
    expect(isCompletePhoneInput('+38 (050) 671-79')).toBe(false);
    expect(isCompletePhoneInput('050')).toBe(false);
  });
});
