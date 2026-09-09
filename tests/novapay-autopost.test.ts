import { describe, it, expect } from 'vitest';
import { classifyNovapayOutgoing, type NovapayOutgoing } from '../lib/novapay-autopost-rules';

const row = (over: Partial<NovapayOutgoing> = {}): NovapayOutgoing => ({
  id: '1', amount: 5000, direction: 'out', counterparty: 'ТОВ Термінал Розетка',
  purpose: 'Гарантійний платіж без ПДВ згідно рахунку ТР-000984232', ...over,
});

describe('classifyNovapayOutgoing — автопроводка поповнень балансів МП', () => {
  it('Rozetka: обидві живі форми призначення гарантійного платежу', () => {
    expect(classifyNovapayOutgoing(row())?.category).toBe('topup:rozetka');
    expect(classifyNovapayOutgoing(row({ purpose: 'Рахунок на оплату ТР-000931138 (Гарантійний платіж) від 17 серпня 2026 р.' }))).toMatchObject({ kind: 'topup', marketplace: 'rozetka' });
  });

  it('Prom: УАПРОМ + рахунок UA-…', () => {
    const r = row({ counterparty: 'Товариство з обмеженою відповідальністю "УАПРОМ"', purpose: 'Рахунок № UA-12585634-1 від 26 серпня 2026 р.' });
    expect(classifyNovapayOutgoing(r)).toMatchObject({ category: 'topup:prom', marketplace: 'prom' });
  });

  it('лише контрагент без «гарантійного платежу» — не впізнаємо (інший рахунок Rozetka — справа людини)', () => {
    expect(classifyNovapayOutgoing(row({ purpose: 'Оплата за рекламу згідно рахунку ТР-1' }))).toBeNull();
  });

  it('УАПРОМ без рахунку UA- — не впізнаємо', () => {
    expect(classifyNovapayOutgoing(row({ counterparty: 'ТОВ "УАПРОМ"', purpose: 'Повернення коштів' }))).toBeNull();
  });

  it('Нова Пошта: рахунок-фактура НП-… — витрата логістики (оплата повернень, факт власника 09.09)', () => {
    const r = row({ counterparty: 'Товариство з обмеженою відповідальністю "Нова Пошта"', purpose: 'Рахунок-фактура № НП-018942197 від 20 серпня 2026р.' });
    expect(classifyNovapayOutgoing(r)).toMatchObject({ kind: 'expense', category: 'logistics' });
    // інший платіж НП без рахунку-фактури — людині
    expect(classifyNovapayOutgoing(row({ counterparty: 'ТОВ "Нова Пошта"', purpose: 'Поповнення рахунку' }))).toBeNull();
  });

  it('інші списання лишаються людині: постачальник, власник', () => {
    expect(classifyNovapayOutgoing(row({ counterparty: 'ФОП РАВЛО ГАННА ВАСИЛІВНА', purpose: 'За консультацію' }))).toBeNull();
    expect(classifyNovapayOutgoing(row({ counterparty: 'Фізична особа-підприємець Курохтіна Ірина Анатоліївна', purpose: 'Оплата за товар' }))).toBeNull();
  });

  it('зарахування і нульові суми — ніколи', () => {
    expect(classifyNovapayOutgoing(row({ direction: 'in' }))).toBeNull();
    expect(classifyNovapayOutgoing(row({ amount: 0 }))).toBeNull();
    expect(classifyNovapayOutgoing(row({ amount: '-5000' }))).toBeNull();
  });
});
