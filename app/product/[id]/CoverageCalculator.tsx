'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Calculator, ChevronDown } from 'lucide-react';
import type { ProductCharacteristic } from '../../../types';

type Props = {
  characteristics: ProductCharacteristic[];
  volume: string | null;
  priceUnit: number;
};

// ─── unit conversion (1 mL ≈ 1 g, density ~1 assumed) ───────────────────────
function toBaseUnit(value: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === 'мл' || u === 'ml') return value;
  if (u === 'л'  || u === 'l')  return value * 1000;
  if (u === 'кг' || u === 'kg') return value * 1000;
  if (u === 'г'  || u === 'g')  return value;
  return value;
}

function parseVolumeBase(volume: string | null): number | null {
  if (!volume) return null;
  const m = volume.match(/([\d.,]+)\s*(мл|л|кг|г|kg|l|ml|g)/i);
  if (!m) return null;
  return toBaseUnit(parseFloat(m[1].replace(',', '.')), m[2]);
}

// ─── parse coverage rate from characteristic value ────────────────────────────
// Returns rate in base units per m², plus a flag if the label is "концентрату"
// (already a concentrate rate — no extra dilution should be applied).
function parseCoverageRate(charValue: string): { rate: number; label: string } | null {
  const v = charValue.trim();

  // Range:  "100-150 мл/м²"  or  "0,3–0,5 кг/м²"
  const rangeArea = v.match(/([\d.,]+)\s*[-–]\s*([\d.,]+)\s*(мл|г|кг|л)\s*\/\s*м[²2]/i);
  if (rangeArea) {
    const lo  = parseFloat(rangeArea[1].replace(',', '.'));
    const hi  = parseFloat(rangeArea[2].replace(',', '.'));
    const avg = (lo + hi) / 2;
    return { rate: toBaseUnit(avg, rangeArea[3]), label: v };
  }

  // Single:  "200 г/м²"  or  "0.13 л/м²"
  const singleArea = v.match(/([\d.,]+)\s*(мл|г|кг|л)\s*\/\s*м[²2]/i);
  if (singleArea) {
    return {
      rate: toBaseUnit(parseFloat(singleArea[1].replace(',', '.')), singleArea[2]),
      label: v,
    };
  }

  // Inverted range/single:  "4–7 м²/л"  or  "16–60 м²/л"
  const invertedRange = v.match(/([\d.,]+)\s*[-–]\s*([\d.,]+)\s*м[²2]\s*\/\s*(мл|г|кг|л)/i);
  if (invertedRange) {
    const lo  = parseFloat(invertedRange[1].replace(',', '.'));
    const hi  = parseFloat(invertedRange[2].replace(',', '.'));
    const unitBase = toBaseUnit(1, invertedRange[3]);
    return { rate: unitBase / ((lo + hi) / 2), label: v };
  }

  const invertedSingle = v.match(/([\d.,]+)\s*м[²2]\s*\/\s*(мл|г|кг|л)/i);
  if (invertedSingle) {
    const coverage = parseFloat(invertedSingle[1].replace(',', '.'));
    const unitBase  = toBaseUnit(1, invertedSingle[2]);
    return { rate: unitBase / coverage, label: v };
  }

  // "8–10 м² на шар / 1 л"  or  "4–7 м² на 1 л за 1 шар" (per-litre stated differently)
  const invertedNaRange = v.match(/([\d.,]+)\s*[-–]\s*([\d.,]+)\s*м[²2][^\/\d]*\/?\s*(?:на\s+)?1\s*(мл|г|кг|л)/i);
  if (invertedNaRange) {
    const lo  = parseFloat(invertedNaRange[1].replace(',', '.'));
    const hi  = parseFloat(invertedNaRange[2].replace(',', '.'));
    const unitBase = toBaseUnit(1, invertedNaRange[3]);
    return { rate: unitBase / ((lo + hi) / 2), label: v };
  }

  return null;
}

// ─── parse all "1:N" options from a string ────────────────────────────────────
// "1:5–1:10"         → [5, 10]
// "1:4 або 1:5"      → [4, 5]
// "1:4 (пояснення)"  → [4]
function parseDilutionOptions(s: string): number[] {
  const found = [...s.matchAll(/1\s*:\s*(\d+)/g)].map(m => parseInt(m[1], 10));
  return [...new Set(found)].sort((a, b) => a - b);
}

// ─── component ────────────────────────────────────────────────────────────────
export default function CoverageCalculator({ characteristics, volume, priceUnit }: Props) {
  const pathname = usePathname();
  const lang = pathname.startsWith('/ru') ? 'ru' : 'uk';
  const t = (uk: string, ru: string) => lang === 'ru' ? ru : uk;
  // Find consumption characteristic (any label containing "витрат" or "розхід")
  const coverageChar = characteristics.find(c => /витрат|розхід/i.test(c.label));
  if (!coverageChar) return null;

  const parsed      = parseCoverageRate(coverageChar.value);
  const productVolG = parseVolumeBase(volume);
  if (!parsed || !productVolG) return null;

  // "Витрата концентрату" means the rate is already per unit of concentrate —
  // dilution does NOT reduce the amount needed further.
  const isConcentrateLabel = /концентрат/i.test(coverageChar.label);

  // ── dilution detection ─────────────────────────────────────────────────────
  // 1. Explicit dilution characteristic
  const dilutionChar = characteristics.find(c => /розведен|розбавлен|розчинен/i.test(c.label));
  // 2. Dilution hint embedded inside coverage value: "після розведення 1:10"
  const embeddedOptions = parseDilutionOptions(coverageChar.value);
  const explicitOptions  = dilutionChar ? parseDilutionOptions(dilutionChar.value) : [];

  // Merge: explicit wins, else embedded
  const detectedOptions = explicitOptions.length ? explicitOptions : embeddedOptions;

  // Build select options shown to user
  const selectOptions: { label: string; n: number }[] = [{ label: t('Без розведення', 'Без разбавления'), n: 0 }];
  if (!isConcentrateLabel) {
    detectedOptions.forEach(n => {
      selectOptions.push({ label: `1:${n}  (×${1 + n})`, n });
    });
    // Always offer common presets that weren't auto-detected
    [3, 5, 9, 10, 19].forEach(n => {
      if (!selectOptions.find(o => o.n === n)) {
        selectOptions.push({ label: `1:${n}  (×${1 + n})`, n });
      }
    });
  }

  // Default: first detected value (most conservative = most product), or 0
  const defaultN = !isConcentrateLabel && detectedOptions.length > 0 ? detectedOptions[0] : 0;

  // ── local state ───────────────────────────────────────────────────────────
  const [open,       setOpen]       = useState(false);
  const [area,       setArea]       = useState('');
  const [coats,      setCoats]      = useState(1);
  const [dilutionN,  setDilutionN]  = useState(defaultN);

  // ── calculation ───────────────────────────────────────────────────────────
  // Dilution 1:N → 1 unit of concentrate yields (1+N) units of working solution.
  // Coverage rate is assumed to be for the working (diluted) solution.
  // Exception: "Витрата концентрату" — rate is per concentrate unit, multiplier = 1.
  const multiplier   = isConcentrateLabel ? 1 : (1 + dilutionN);
  const effectiveVol = productVolG * multiplier;

  const areaNum   = parseFloat(area.replace(',', '.'));
  const isValid   = !isNaN(areaNum) && areaNum > 0;
  const units     = isValid ? Math.ceil((areaNum * parsed.rate * coats) / effectiveVol) : null;
  const totalCost = units && priceUnit > 0 ? units * priceUnit : null;

  const selectStyle: React.CSSProperties = {
    height: '38px', padding: '0 8px',
    border: '1px solid var(--border)', borderRadius: '8px',
    fontSize: '13px', background: 'var(--bg-card)', color: 'var(--text-primary)',
    cursor: 'pointer',
  };

  const autoTag = (dilutionChar || embeddedOptions.length > 0) && !isConcentrateLabel;

  return (
    <div style={{ marginTop: '8px', borderRadius: '10px', border: '1px solid var(--border)', overflow: 'hidden' }}>

      {/* Header / toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '8px 14px',
          display: 'flex', alignItems: 'center', gap: '8px',
          background: open ? '#EEF4FF' : 'var(--bg-soft)',
          border: 'none', cursor: 'pointer',
          color: open ? '#1E40AF' : 'var(--text-secondary)',
          fontSize: '13px', fontWeight: 600,
          transition: 'background 0.15s',
        }}
      >
        <Calculator size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
        <span>{t('Розрахувати витрату', 'Рассчитать расход')}</span>
        <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)', marginLeft: 'auto', marginRight: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
          {parsed.label}
        </span>
        <ChevronDown size={13} style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {/* Body */}
      {open && (
        <div style={{ padding: '14px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>

          {/* Row 1: area + coats */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                {t('Площа (м²)', 'Площадь (м²)')}
              </label>
              <input
                type="number"
                value={area}
                onChange={e => setArea(e.target.value)}
                placeholder="напр. 25"
                min={0}
                step={0.5}
                autoFocus
                style={{
                  width: '100%', height: '38px', padding: '0 10px',
                  border: '1px solid var(--border)', borderRadius: '8px',
                  fontSize: '14px', outline: 'none',
                  background: 'var(--bg-card)', color: 'var(--text-primary)',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                {t('Шарів', 'Слоёв')}
              </label>
              <select value={coats} onChange={e => setCoats(Number(e.target.value))} style={selectStyle}>
                <option value={1}>{t('1 шар', '1 слой')}</option>
                <option value={2}>{t('2 шари', '2 слоя')}</option>
                <option value={3}>{t('3 шари', '3 слоя')}</option>
              </select>
            </div>
          </div>

          {/* Row 2: dilution (hidden for concentrate-labelled products) */}
          {!isConcentrateLabel && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                {t('Розведення водою', 'Разбавление водой')}
                {autoTag && (
                  <span style={{ fontSize: '10px', background: '#DCFCE7', color: '#15803D', borderRadius: '4px', padding: '1px 5px', fontWeight: 600 }}>
                    авто
                  </span>
                )}
              </label>
              <select
                value={dilutionN}
                onChange={e => setDilutionN(Number(e.target.value))}
                style={{ ...selectStyle, minWidth: '160px' }}
              >
                {selectOptions.map(o => (
                  <option key={o.n} value={o.n}>{o.label}</option>
                ))}
              </select>
              {dilutionN > 0 && (
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                  {t('З', 'Из')} 1 {/кг/.test(volume ?? '') ? 'кг' : 'л'} {t('концентрату → ~', 'концентрата → ~')}{1 + dilutionN} {/кг/.test(volume ?? '') ? 'кг' : 'л'} {t('робочого розчину', 'рабочего раствора')}
                </div>
              )}
            </div>
          )}

          {/* Result */}
          {units !== null && (
            <div style={{
              padding: '12px 14px', borderRadius: '8px',
              background: '#EEF4FF', border: '1px solid #BFDBFE',
              display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap',
            }}>
              <div>
                <div style={{ fontSize: '10px', color: '#3B82F6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '2px' }}>
                  {t('Потрібно', 'Необходимо')}
                </div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#1E3A5F', lineHeight: 1 }}>
                  {units} <span style={{ fontSize: '14px', fontWeight: 500, color: '#64748B' }}>шт</span>
                </div>
              </div>
              {totalCost !== null && (
                <div>
                  <div style={{ fontSize: '10px', color: '#3B82F6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '2px' }}>
                    {t('Орієнтовна сума', 'Примерная сумма')}
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#1E3A5F', lineHeight: 1 }}>
                    {totalCost.toLocaleString('uk-UA')} <span style={{ fontSize: '14px', fontWeight: 500, color: '#64748B' }}>грн</span>
                  </div>
                </div>
              )}
              {dilutionN > 0 && (
                <div style={{ fontSize: '11px', color: '#64748B', borderLeft: '1px solid #BFDBFE', paddingLeft: '16px', lineHeight: 1.5 }}>
                  {t('З урахуванням', 'С учётом')}<br />{t('розведення', 'разбавления')} 1:{dilutionN}
                </div>
              )}
            </div>
          )}

          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
            {t('Розрахунок орієнтовний. Витрата залежить від типу поверхні та техніки нанесення.', 'Расчёт ориентировочный. Расход зависит от типа поверхности и техники нанесения.')}
          </div>
        </div>
      )}
    </div>
  );
}
