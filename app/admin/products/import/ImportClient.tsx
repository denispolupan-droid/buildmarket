'use client';

import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Check, AlertCircle, Loader2, Download } from 'lucide-react';

type ImportResult = {
  success: number;
  errors: { row: number; sku: string; error: string }[];
};

export default function ImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<Record<string, string>[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);

    const formData = new FormData();
    formData.append('file', f);
    formData.append('preview', 'true');

    try {
      const res = await fetch('/api/admin/products/import', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.preview) {
        setPreview(data.preview);
      }
    } catch {
      setPreview(null);
    }
  }

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/admin/products/import', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ success: 0, errors: [{ row: 0, sku: '', error: 'Помилка з\'єднання' }] });
    }

    setImporting(false);
  }

  function downloadTemplate() {
    window.open('/api/admin/products/import?template=true', '_blank');
  }

  return (
    <div>
      <div style={{
        background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0',
        padding: '24px', marginBottom: '20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
            Завантаження файлу
          </h2>
          <button
            onClick={downloadTemplate}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2E8F0',
              background: '#fff', fontSize: '13px', fontWeight: 600, color: '#475569', cursor: 'pointer',
            }}
          >
            <Download size={14} /> Завантажити шаблон
          </button>
        </div>

        <div
          onClick={() => inputRef.current?.click()}
          style={{
            border: '2px dashed #E2E8F0', borderRadius: '12px',
            padding: '48px', textAlign: 'center', cursor: 'pointer',
            background: file ? '#F0FDF4' : '#FAFAFA',
            transition: 'all 0.2s',
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          {file ? (
            <>
              <FileSpreadsheet size={48} color="#22C55E" style={{ marginBottom: '12px' }} />
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#0F172A' }}>{file.name}</div>
              <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
                Натисніть щоб вибрати інший файл
              </div>
            </>
          ) : (
            <>
              <Upload size={48} color="#94A3B8" style={{ marginBottom: '12px' }} />
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#0F172A' }}>
                Перетягніть файл або натисніть для вибору
              </div>
              <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
                Підтримуються формати: .xlsx, .xls, .csv
              </div>
            </>
          )}
        </div>

        {preview && preview.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#475569', marginBottom: '12px' }}>
              Попередній перегляд (перші 5 рядків):
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    {Object.keys(preview[0]).slice(0, 8).map(key => (
                      <th key={key} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #E2E8F0', fontWeight: 600 }}>
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).slice(0, 8).map((val, j) => (
                        <td key={j} style={{ padding: '8px 12px', borderBottom: '1px solid #F1F5F9', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {String(val ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {file && (
          <button
            onClick={handleImport}
            disabled={importing}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              height: '48px', padding: '0 28px', borderRadius: '10px',
              background: '#1E3A5F', color: '#fff', border: 'none',
              fontSize: '14px', fontWeight: 600, cursor: importing ? 'wait' : 'pointer',
              opacity: importing ? 0.7 : 1, marginTop: '20px',
            }}
          >
            {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {importing ? 'Імпортую...' : 'Імпортувати'}
          </button>
        )}
      </div>

      {result && (
        <div style={{
          background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0',
          padding: '24px',
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>
            Результат імпорту
          </h2>

          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            <div style={{
              flex: 1, padding: '16px', borderRadius: '8px',
              background: '#F0FDF4', border: '1px solid #BBF7D0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16A34A' }}>
                <Check size={20} />
                <span style={{ fontSize: '24px', fontWeight: 700 }}>{result.success}</span>
              </div>
              <div style={{ fontSize: '13px', color: '#15803D', marginTop: '4px' }}>Успішно імпортовано</div>
            </div>

            <div style={{
              flex: 1, padding: '16px', borderRadius: '8px',
              background: result.errors.length > 0 ? '#FEF2F2' : '#F8FAFC',
              border: `1px solid ${result.errors.length > 0 ? '#FECACA' : '#E2E8F0'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: result.errors.length > 0 ? '#DC2626' : '#64748B' }}>
                <AlertCircle size={20} />
                <span style={{ fontSize: '24px', fontWeight: 700 }}>{result.errors.length}</span>
              </div>
              <div style={{ fontSize: '13px', color: result.errors.length > 0 ? '#B91C1C' : '#64748B', marginTop: '4px' }}>Помилок</div>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#DC2626', marginBottom: '8px' }}>Помилки:</h3>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {result.errors.map((err, i) => (
                  <div key={i} style={{
                    padding: '8px 12px', background: '#FEF2F2', borderRadius: '6px',
                    fontSize: '13px', color: '#991B1B', marginBottom: '4px',
                  }}>
                    Рядок {err.row}{err.sku ? ` (${err.sku})` : ''}: {err.error}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{
        background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0',
        padding: '24px', marginTop: '20px',
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>
          Формат файлу
        </h2>
        <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '12px' }}>
          Обов'язкові колонки: <strong>sku</strong>, <strong>name</strong>, <strong>brand</strong>
        </p>
        <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '12px' }}>
          Додаткові колонки: category_slug, product_type, color, volume, pack_qty, min_order,
          price_unit, price_retail, stock_qty, bc, ac, description
        </p>
        <p style={{ fontSize: '13px', color: '#94A3B8' }}>
          Якщо товар з таким SKU вже існує — він буде оновлений.
        </p>
      </div>
    </div>
  );
}
