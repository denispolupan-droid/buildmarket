import type { ReactNode } from 'react';

// Рядок над вмістом вкладки: зліва — скільки чого на екрані, справа — дії.
// Заголовок розділу і вкладки малює layout, тож окремий h1 на кожній сторінці
// більше не потрібен — лишався б другий заголовок під першим.
export default function SectionBar({ count, children }: { count?: ReactNode; children?: ReactNode }) {
  if (!count && !children) return null;
  return (
    <div className="proc-bar">
      {count ? <span className="proc-bar-count">{count}</span> : <span />}
      {children ? <div className="proc-actions">{children}</div> : null}
    </div>
  );
}

/** «1 позиція · 2 позиції · 5 позицій» — інакше лічильники читаються як помилка. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
