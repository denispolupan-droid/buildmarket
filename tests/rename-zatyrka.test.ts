import { describe, it, expect } from 'vitest';
import { renameProduct } from '../scripts/rename-zatyrka';

// Пастка, на яку я наступив під час перевірки: /^Замазка\b/ НЕ спрацьовує на
// кирилиці — межу слова \b JS визначає за ASCII, і між «а» та пробілом її немає.
// Перший прогін мовчки не замінив нічого, і це виглядало як «формат не
// змінюється». Тест тримає правильний варіант із (?=\s).

describe('renameProduct', () => {
  it('замінює слово на початку назви', () => {
    expect(renameProduct('Замазка для швів Ceresit CE33, 120, 2 кг, жасмін'))
      .toBe('Затирка для швів Ceresit CE33, 120, 2 кг, жасмін');
    expect(renameProduct('Замазки для швів Ceresit')).toBe('Затирки для швів Ceresit');
  });

  it('не чіпає слово всередині назви — там воно може бути свідомим синонімом', () => {
    expect(renameProduct('Клей та замазка для швів')).toBe('Клей та замазка для швів');
    expect(renameProduct('Ceresit Замазка CE33')).toBe('Ceresit Замазка CE33');
  });

  it('не чіпає інші назви', () => {
    expect(renameProduct('Герметик силіконовий Ceresit CS 25')).toBe('Герметик силіконовий Ceresit CS 25');
    expect(renameProduct('')).toBe('');
  });

  it('вимагає пробіл після слова — «Замазкою» не є формою для заміни', () => {
    expect(renameProduct('Замазкою для швів')).toBe('Замазкою для швів');
  });
});
