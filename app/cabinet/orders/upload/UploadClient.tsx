'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Download, CheckCircle, XCircle, AlertCircle, Send, ChevronLeft, FileSpreadsheet } from 'lucide-react';

type ParsedRow = {
  row_num:       number;
  sku:           string;
  product_name:  string;
  qty:           number;
  cost_price:    number;
  selling_price: number;
  last_name:     string;
  first_name:    string;
  mid_name:      string;
  phone:         string;
  city_name:     string;
  warehouse_name: string;
  status:        'valid' | 'error';
  errors:        string[];
};

type ParseResponse = {
  rows:          ParsedRow[];
  valid_count:   number;
  error_count:   number;
  total_cost:    number;
  total_cod:     number;
  balance_avail: number;
  can_submit:    boolean;
};

type ConfirmResult = {
  row_num:      number;
  status:       'ok' | 'error';
  order_number?: number;
  ttn?:          string;
  error?:        string;
};

export default function UploadClient() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [dragging,  setDragging]  = useState(false);
  const [parsing,   setParsing]   = useState(false);
  const [parseData, setParseData] = useState<ParseResponse | null>(null);
  const [parseErr,  setParseErr]  = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [progress,   setProgress]  = useState(0);
  const [results,    setResults]   = useState<ConfirmResult[] | null>(null);

  async function handleFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setParseErr('Оберіть файл формату .xlsx або .xls');
      return;
    }
    setParsing(true);
    setParseErr('');
    setParseData(null);
    setResults(null);

    const fd = new FormData();
    fd.append('file', file);

    const res  = await fetch('/api/cabinet/orders/parse', { method: 'POST', body: fd });
    const data = await res.json();
    setParsing(false);

    if (!res.ok) { setParseErr(data.error ?? 'Помилка обробки файлу'); return; }
    setParseData(data);
  }

  async function handleSubmit() {
    if (!parseData) return;
    const validRows = parseData.rows.filter(r => r.status === 'valid');
    if (!validRows.length) return;

    setSubmitting(true);
    setProgress(0);

    // Обробляємо по одному для відстеження прогресу
    const allResults: ConfirmResult[] = [];
    for (let i = 0; i < validRows.length; i++) {
      setProgress(Math.round(((i) / validRows.length) * 100));
      const res  = await fetch('/api/cabinet/orders/bulk-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [validRows[i]] }),
      });
      const data = await res.json();
      allResults.push(...(data.results ?? []));
    }
    setProgress(100);
    setSubmitting(false);
    setResults(allResults);
  }

  // ── Drag & Drop handlers ───────────────────────────────────────────────────
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  // ── Results screen ─────────────────────────────────────────────────────────
  if (results) {
    const ok    = results.filter(r => r.status === 'ok');
    const fails = results.filter(r => r.status === 'error');
    return (
      <div style={{ padding: '28px 32px 64px', maxWidth: '900px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '24px' }}>
          Результат обробки
        </h1>

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
            <CheckCircle size={28} color="#15803D" style={{ marginBottom: '8px' }} />
            <div style={{ fontSize: '32px', fontWeight: 800, color: '#15803D' }}>{ok.length}</div>
            <div style={{ fontSize: '13px', color: '#15803D' }}>Замовлень створено</div>
          </div>
          {fails.length > 0 && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
              <XCircle size={28} color="#DC2626" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '32px', fontWeight: 800, color: '#DC2626' }}>{fails.length}</div>
              <div style={{ fontSize: '13px', color: '#DC2626' }}>Помилок</div>
            </div>
          )}
        </div>

        {/* TTN list */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }}>
          <div style={{ padding: '14px 20px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Створені ТТН
          </div>
          {results.map((r, i) => (
            <div key={i} style={{ padding: '12px 20px', borderBottom: i < results.length - 1 ? '1px solid var(--border-light)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Рядок {r.row_num}</div>
              {r.status === 'ok' ? (
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Замовлення #{r.order_number}</span>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: '#1E3A5F', letterSpacing: '1px', fontFamily: 'monospace' }}>{r.ttn}</span>
                  <CheckCircle size={16} color="#15803D" />
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#DC2626' }}>{r.error}</span>
                  <XCircle size={16} color="#DC2626" />
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => { setResults(null); setParseData(null); }} style={{ height: '40px', padding: '0 20px', borderRadius: '9px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Завантажити ще файл
          </button>
          <button onClick={() => router.push('/cabinet/orders')} style={{ height: '40px', padding: '0 20px', borderRadius: '9px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
            Мої замовлення →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '960px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
        <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px', padding: 0 }}>
          <ChevronLeft size={15} /> Назад
        </button>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Завантаження замовлень з Excel
        </h1>
      </div>

      {/* Step 1: Download template */}
      {!parseData && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, color: '#4880B8', flexShrink: 0 }}>1</div>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Завантажте шаблон</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', paddingLeft: '40px' }}>
            Заповніть шаблон: артикул, кількість, ваша ціна, дані отримувача, місто і номер відділення НП.
          </p>
          <div style={{ paddingLeft: '40px' }}>
            <a href="/api/cabinet/orders/template" download style={{
              display: 'inline-flex', alignItems: 'center', gap: '7px',
              height: '38px', padding: '0 18px', borderRadius: '8px',
              border: '1.5px solid #4880B8', color: '#4880B8', background: '#EFF6FF',
              fontSize: '13px', fontWeight: 600, textDecoration: 'none',
            }}>
              <Download size={14} /> Завантажити шаблон .xlsx
            </a>
          </div>
        </div>
      )}

      {/* Step 2: Upload */}
      {!parseData && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, color: '#4880B8', flexShrink: 0 }}>2</div>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Завантажте заповнений файл</span>
          </div>

          {parseErr && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', marginLeft: '40px' }}>
              <AlertCircle size={15} color="#DC2626" style={{ flexShrink: 0, marginTop: '1px' }} />
              <span style={{ fontSize: '13px', color: '#DC2626' }}>{parseErr}</span>
            </div>
          )}

          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              marginLeft: '40px', border: `2px dashed ${dragging ? '#4880B8' : 'var(--border)'}`,
              borderRadius: '12px', padding: '40px',
              background: dragging ? '#EFF6FF' : 'var(--bg-soft)',
              textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {parsing ? (
              <div>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Обробляємо файл і перевіряємо НП...</div>
              </div>
            ) : (
              <div>
                <FileSpreadsheet size={36} color={dragging ? '#4880B8' : 'var(--text-muted)'} style={{ marginBottom: '12px' }} />
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Перетягніть файл сюди або натисніть для вибору
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>.xlsx, .xls</div>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      )}

      {/* Step 3: Preview */}
      {parseData && !submitting && (
        <>
          {/* Summary bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Рядків у файлі', value: String(parseData.rows.length), color: 'var(--text-primary)' },
              { label: '✓ Коректних', value: String(parseData.valid_count), color: '#15803D' },
              { label: '✗ З помилками', value: String(parseData.error_count), color: parseData.error_count ? '#DC2626' : 'var(--text-muted)' },
              { label: 'Списання з балансу', value: `${parseData.total_cost.toFixed(2)} ₴`, color: parseData.can_submit ? '#1E3A5F' : '#DC2626' },
            ].map(c => (
              <div key={c.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{c.label}</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>

          {!parseData.can_submit && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '10px', padding: '14px 18px', marginBottom: '16px' }}>
              <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: '1px' }} />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#DC2626' }}>Недостатньо балансу</div>
                <div style={{ fontSize: '12px', color: '#991B1B' }}>
                  Потрібно {parseData.total_cost.toFixed(2)} ₴, доступно {parseData.balance_avail.toFixed(2)} ₴. Поповніть баланс.
                </div>
              </div>
            </div>
          )}

          {/* Preview table */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '50px 80px 1fr 60px 90px 90px 120px auto', padding: '10px 16px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', gap: '8px' }}>
              <span>#</span><span>Артикул</span><span>Товар / Отримувач</span>
              <span style={{ textAlign: 'center' }}>К-сть</span>
              <span style={{ textAlign: 'right' }}>Закупка</span>
              <span style={{ textAlign: 'right' }}>COD</span>
              <span>Відділення</span>
              <span>Статус</span>
            </div>
            {parseData.rows.map((row, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '50px 80px 1fr 60px 90px 90px 120px auto',
                padding: '10px 16px', borderBottom: i < parseData.rows.length - 1 ? '1px solid var(--border-light)' : 'none',
                alignItems: 'center', gap: '8px',
                background: row.status === 'error' ? 'rgba(220,38,38,0.04)' : 'transparent',
              }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{row.row_num}</span>
                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{row.sku}</span>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.product_name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{row.last_name} {row.first_name} · {row.phone}</div>
                  {row.errors.map((e, ei) => (
                    <div key={ei} style={{ fontSize: '11px', color: '#DC2626', marginTop: '2px' }}>⚠ {e}</div>
                  ))}
                </div>
                <span style={{ textAlign: 'center', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{row.qty}</span>
                <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>{row.cost_price} ₴</span>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#15803D' }}>{row.selling_price} ₴</span>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.city_name}<br />{row.warehouse_name ? `№ ${row.warehouse_name}` : ''}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {row.status === 'valid'
                    ? <CheckCircle size={16} color="#15803D" />
                    : <XCircle size={16} color="#DC2626" />}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button onClick={() => { setParseData(null); setParseErr(''); }} style={{ height: '40px', padding: '0 18px', borderRadius: '9px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              Завантажити інший файл
            </button>
            <button
              onClick={handleSubmit}
              disabled={!parseData.can_submit || parseData.valid_count === 0}
              style={{
                height: '40px', padding: '0 24px', borderRadius: '9px', border: 'none',
                background: parseData.can_submit && parseData.valid_count > 0 ? '#1E3A5F' : '#94A3B8',
                color: '#fff', fontSize: '13px', fontWeight: 700,
                cursor: parseData.can_submit && parseData.valid_count > 0 ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: '7px',
              }}
            >
              <Send size={14} />
              Створити {parseData.valid_count} замовлення
            </button>
          </div>
        </>
      )}

      {/* Progress screen */}
      {submitting && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
            Створюємо замовлення та ТТН... {progress}%
          </div>
          <div style={{ background: 'var(--bg-soft)', borderRadius: '8px', height: '8px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: '#1E3A5F', borderRadius: '8px', transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>
            Не закривайте сторінку
          </div>
        </div>
      )}
    </div>
  );
}
