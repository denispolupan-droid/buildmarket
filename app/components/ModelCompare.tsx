import { Check, Minus } from 'lucide-react';
import { WHOLESALE_MIN } from '../../lib/site';

// Таблиця «роздріб / опт / дропшипінг» живе в одному місці, бо показується
// і на /opt, і на /dropship (там підсвічена інша колонка). Чотири копії
// однакових умов неминуче розійшлися б.

type Lang = 'uk' | 'ru';
type Column = 'retail' | 'opt' | 'drop';
type Cell = string | boolean;

type Table = {
  head: Record<Column, string>;
  rows: { row: string; retail: Cell; opt: Cell; drop: Cell }[];
};

const TABLE: Record<Lang, Table> = {
  uk: {
    head: { retail: 'Роздріб', opt: 'Опт', drop: 'Дропшипінг' },
    rows: [
      { row: 'Мінімальне замовлення',   retail: 'від 1 шт.',            opt: `${WHOLESALE_MIN} грн`,             drop: 'від 1 шт.' },
      { row: 'Ціна',                    retail: 'роздрібна',            opt: 'оптова в кабінеті',                drop: 'дроп-ціна' },
      { row: 'Потрібен свій склад',     retail: false,                  opt: true,                               drop: false },
      { row: 'Хто відправляє клієнту',  retail: 'FIXLINE',              opt: 'ви самі',                          drop: 'FIXLINE від вашого імені' },
      { row: 'Рахунок і накладна',      retail: true,                   opt: true,                               drop: true },
      { row: 'Кому підходить',          retail: 'приватним покупцям',   opt: 'дилерам, підрядникам, магазинам',  drop: 'продавцям без складу' },
    ],
  },
  ru: {
    head: { retail: 'Розница', opt: 'Опт', drop: 'Дропшиппинг' },
    rows: [
      { row: 'Минимальный заказ',       retail: 'от 1 шт.',             opt: `${WHOLESALE_MIN} грн`,             drop: 'от 1 шт.' },
      { row: 'Цена',                    retail: 'розничная',            opt: 'оптовая в кабинете',               drop: 'дроп-цена' },
      { row: 'Нужен свой склад',        retail: false,                  opt: true,                               drop: false },
      { row: 'Кто отправляет клиенту',  retail: 'FIXLINE',              opt: 'вы сами',                          drop: 'FIXLINE от вашего имени' },
      { row: 'Счёт и накладная',        retail: true,                   opt: true,                               drop: true },
      { row: 'Кому подходит',           retail: 'частным покупателям',  opt: 'дилерам, подрядчикам, магазинам',  drop: 'продавцам без склада' },
    ],
  },
};

function CellValue({ value }: { value: Cell }) {
  if (value === true)  return <Check size={17} color="#15803D" strokeWidth={2.5} />;
  if (value === false) return <Minus size={17} color="#94A3B8" strokeWidth={2.5} />;
  return <span>{value}</span>;
}

export default function ModelCompare({ lang, highlight }: { lang: Lang; highlight: Column }) {
  const { head, rows } = TABLE[lang];
  const columns: Column[] = ['retail', 'opt', 'drop'];

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '620px', fontSize: '13px' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '14px 16px' }} />
            {columns.map(col => (
              <th key={col} style={{
                padding: '14px 16px',
                fontWeight: col === highlight ? 800 : 700,
                color: col === highlight ? '#fff' : 'var(--text-secondary)',
                background: col === highlight ? '#4880B8' : 'transparent',
                borderRadius: col === highlight ? '12px 12px 0 0' : undefined,
              }}>
                {head[col]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.row} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '14px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>{r.row}</td>
              {columns.map(col => {
                const on = col === highlight;
                return (
                  <td key={col} style={{
                    padding: '14px 16px', textAlign: 'center',
                    color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: on ? 700 : 400,
                    background: on ? 'rgba(72,128,184,0.07)' : undefined,
                    ...(on && i === rows.length - 1 ? { borderRadius: '0 0 12px 12px' } : {}),
                  }}>
                    <CellValue value={r[col]} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
