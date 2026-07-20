import { describe, it, expect } from 'vitest';
import { promDateParam, parsePromNumber } from '../lib/prom-api';

describe('promDateParam — нормалізація date_from для Prom /orders/list', () => {
  it('прибирає мілісекунди і Z (Date.toISOString) — інакше Prom повертає 0 замовлень', () => {
    expect(promDateParam('2026-07-20T18:10:44.174Z')).toBe('2026-07-20T18:10:44');
    expect(promDateParam('2026-07-20T18:10:44.000Z')).toBe('2026-07-20T18:10:44');
  });

  it('ISO без мілісекунд лишає як є', () => {
    expect(promDateParam('2026-07-20T18:10:44')).toBe('2026-07-20T18:10:44');
  });

  it('date-only лишає як є', () => {
    expect(promDateParam('2026-07-20')).toBe('2026-07-20');
  });
});

describe('parsePromNumber — грошові поля Prom ("1 713 грн")', () => {
  it('пробіл-розділювач тисяч + суфікс валюти (інакше parseFloat дає 1)', () => {
    expect(parsePromNumber('1 713 грн')).toBe(1713);
  });

  it('nbsp як розділювач тисяч', () => {
    const nbsp = String.fromCharCode(0x00A0);
    expect(parsePromNumber(`1${nbsp}713${nbsp}грн`)).toBe(1713);
  });

  it('кома як десятковий', () => {
    expect(parsePromNumber('1 713,50 грн')).toBe(1713.5);
  });

  it('крапка як десятковий', () => {
    expect(parsePromNumber('571.00 грн')).toBe(571);
  });

  it('просте число і порожні значення', () => {
    expect(parsePromNumber('571')).toBe(571);
    expect(parsePromNumber('')).toBe(0);
    expect(parsePromNumber(null)).toBe(0);
    expect(parsePromNumber(undefined)).toBe(0);
  });
});
