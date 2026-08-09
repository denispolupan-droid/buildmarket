/**
 * Переставляння елемента списку — спільне для перетягування мишею і кнопок
 * ↑↓ в адмінці. Чиста функція: логіка порядку не має жити в обробниках подій.
 */
export function reorderList<T>(list: T[], from: number, to: number): T[] {
  if (from === to) return list;
  if (from < 0 || from >= list.length) return list;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
