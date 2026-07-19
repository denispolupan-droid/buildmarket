'use client';

// Будівельні калькулятори витрати: герметик, монтажна піна, ґрунтовка/фарба,
// монтажний клей. Формули — стандартні галузеві (див. SEO-текст на сторінці).
// Один компонент на обидві локалі (словник t).

import { useState } from 'react';
import Link from 'next/link';
import { Calculator, ShoppingCart } from 'lucide-react';

type Locale = 'uk' | 'ru';

const T = {
  uk: {
    sealant: 'Витрата герметика',
    sealantDesc: 'Прямокутний шов: довжина × ширина × глибина',
    foam: 'Витрата монтажної піни',
    foamDesc: 'Монтажний зазор вікон/дверей',
    primer: 'Витрата ґрунтовки / фарби',
    primerDesc: 'Площа × норма витрати × шари',
    glue: 'Витрата монтажного клею',
    glueDesc: 'Клейовий джгут: довжина × діаметр',
    length: 'Довжина шва, м', width: 'Ширина шва, мм', depth: 'Глибина шва, мм',
    cartridge: 'Об’єм картриджа', perimeter: 'Периметр прорізів, м',
    gap: 'Ширина зазору, мм', gapDepth: 'Глибина зазору, мм',
    cylinder: 'Вихід балона', area: 'Площа, м²', rate: 'Витрата, мл/м²',
    layers: 'Шарів', pack: 'Тара, л', glueLen: 'Довжина джгута, м', diameter: 'Діаметр джгута, мм',
    resultVolume: 'Потрібно', resultPieces: 'З запасом 10%',
    pieces: 'шт', litres: 'л', ml: 'мл',
    ctaSealant: 'Підібрати герметик', ctaFoam: 'Підібрати піну',
    ctaPrimer: 'Підібрати ґрунтовку', ctaPaint: 'Фарби', ctaGlue: 'Підібрати клей',
  },
  ru: {
    sealant: 'Расход герметика',
    sealantDesc: 'Прямоугольный шов: длина × ширина × глубина',
    foam: 'Расход монтажной пены',
    foamDesc: 'Монтажный зазор окон/дверей',
    primer: 'Расход грунтовки / краски',
    primerDesc: 'Площадь × норма расхода × слои',
    glue: 'Расход монтажного клея',
    glueDesc: 'Клеевой жгут: длина × диаметр',
    length: 'Длина шва, м', width: 'Ширина шва, мм', depth: 'Глубина шва, мм',
    cartridge: 'Объём картриджа', perimeter: 'Периметр проёмов, м',
    gap: 'Ширина зазора, мм', gapDepth: 'Глубина зазора, мм',
    cylinder: 'Выход баллона', area: 'Площадь, м²', rate: 'Расход, мл/м²',
    layers: 'Слоёв', pack: 'Тара, л', glueLen: 'Длина жгута, м', diameter: 'Диаметр жгута, мм',
    resultVolume: 'Нужно', resultPieces: 'С запасом 10%',
    pieces: 'шт', litres: 'л', ml: 'мл',
    ctaSealant: 'Подобрать герметик', ctaFoam: 'Подобрать пену',
    ctaPrimer: 'Подобрать грунтовку', ctaPaint: 'Краски', ctaGlue: 'Подобрать клей',
  },
} as const;

function num(v: string): number {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const card: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px',
  padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px',
};
const inputStyle: React.CSSProperties = {
  height: '38px', padding: '0 12px', border: '1.5px solid var(--border)', borderRadius: '9px',
  fontSize: '14px', outline: 'none', background: 'var(--bg-soft)', color: 'var(--text-primary)',
  width: '100%', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.04em', marginBottom: '5px', display: 'block',
};

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ flex: 1, minWidth: '110px' }}>
      <label style={labelStyle}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} inputMode="decimal" style={inputStyle} />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[];
}) {
  return (
    <div style={{ flex: 1, minWidth: '110px' }}>
      <label style={labelStyle}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

function ResultBox({ lines, cta }: { lines: [string, string][]; cta: { href: string; label: string }[] }) {
  return (
    <div style={{ background: 'rgba(72,128,184,0.07)', border: '1px solid rgba(72,128,184,0.2)', borderRadius: '12px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: '160px' }}>
        {lines.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '13.5px', color: 'var(--text-secondary)', padding: '2px 0' }}>
            <span>{k}</span>
            <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{v}</strong>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {cta.map(c => (
          <Link key={c.href} href={c.href} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 14px', borderRadius: '9px', background: '#1E3A5F', color: '#fff', fontSize: '12.5px', fontWeight: 700, textDecoration: 'none' }}>
            <ShoppingCart size={13} /> {c.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function CardHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>
        <Calculator size={17} color="#4880B8" /> {title}
      </div>
      <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '3px' }}>{desc}</div>
    </div>
  );
}

export default function CalculatorsClient({ locale }: { locale: Locale }) {
  const t = T[locale];
  const shop = locale === 'ru' ? '/ru/shop' : '/shop';

  // ── Герметик ──
  const [sLen, setSLen] = useState('10');
  const [sW,   setSW]   = useState('8');
  const [sD,   setSD]   = useState('6');
  const [sCart, setSCart] = useState('300');
  const sealantMl = num(sLen) * num(sW) * num(sD); // 1 м × 1 мм × 1 мм = 1 мл
  const sealantPieces = sealantMl > 0 ? Math.ceil(sealantMl * 1.1 / num(sCart)) : 0;

  // ── Піна ──
  const [fPer, setFPer] = useState('15');
  const [fGap, setFGap] = useState('30');
  const [fDep, setFDep] = useState('60');
  const [fCyl, setFCyl] = useState('45');
  const foamL = num(fPer) * num(fGap) * num(fDep) / 1000; // м × мм × мм / 1000 = л
  const foamPieces = foamL > 0 ? Math.ceil(foamL * 1.15 / num(fCyl)) : 0;

  // ── Ґрунтовка / фарба ──
  const [pArea,  setPArea]  = useState('50');
  const [pRate,  setPRate]  = useState('150');
  const [pLayers, setPLayers] = useState('1');
  const [pPack,  setPPack]  = useState('5');
  const primerL = num(pArea) * num(pRate) * num(pLayers) / 1000;
  const primerPieces = primerL > 0 ? Math.ceil(primerL * 1.05 / num(pPack)) : 0;

  // ── Монтажний клей ──
  const [gLen, setGLen] = useState('12');
  const [gDia, setGDia] = useState('6');
  const [gCart, setGCart] = useState('300');
  const glueMl = Math.PI / 4 * num(gDia) * num(gDia) * num(gLen); // мм² × м = мл
  const gluePieces = glueMl > 0 ? Math.ceil(glueMl * 1.1 / num(gCart)) : 0;

  const fmt1 = (n: number) => n.toLocaleString(locale === 'ru' ? 'ru-UA' : 'uk-UA', { maximumFractionDigits: 1 });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }} className="calc-grid">

      <div style={card} id="sealant">
        <CardHeader title={t.sealant} desc={t.sealantDesc} />
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Field label={t.length} value={sLen} onChange={setSLen} />
          <Field label={t.width} value={sW} onChange={setSW} />
          <Field label={t.depth} value={sD} onChange={setSD} />
          <SelectField label={t.cartridge} value={sCart} onChange={setSCart}
            options={[{ v: '280', l: '280 мл' }, { v: '300', l: '300 мл' }, { v: '310', l: '310 мл' }, { v: '600', l: '600 мл' }]} />
        </div>
        <ResultBox
          lines={[[t.resultVolume, `${fmt1(sealantMl)} ${t.ml}`], [t.resultPieces, `${sealantPieces} ${t.pieces} × ${sCart} ${t.ml}`]]}
          cta={[{ href: `${shop}/germetyky`, label: t.ctaSealant }]} />
      </div>

      <div style={card} id="foam">
        <CardHeader title={t.foam} desc={t.foamDesc} />
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Field label={t.perimeter} value={fPer} onChange={setFPer} />
          <Field label={t.gap} value={fGap} onChange={setFGap} />
          <Field label={t.gapDepth} value={fDep} onChange={setFDep} />
          <SelectField label={t.cylinder} value={fCyl} onChange={setFCyl}
            options={[{ v: '30', l: '~30 л' }, { v: '45', l: '~45 л' }, { v: '65', l: '~65 л' }]} />
        </div>
        <ResultBox
          lines={[[t.resultVolume, `${fmt1(foamL)} ${t.litres}`], [locale === 'ru' ? 'С запасом 15%' : 'З запасом 15%', `${foamPieces} ${t.pieces}`]]}
          cta={[{ href: `${shop}/montazhna-pina`, label: t.ctaFoam }]} />
      </div>

      <div style={card} id="primer">
        <CardHeader title={t.primer} desc={t.primerDesc} />
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Field label={t.area} value={pArea} onChange={setPArea} />
          <Field label={t.rate} value={pRate} onChange={setPRate} />
          <SelectField label={t.layers} value={pLayers} onChange={setPLayers}
            options={[{ v: '1', l: '1' }, { v: '2', l: '2' }, { v: '3', l: '3' }]} />
          <SelectField label={t.pack} value={pPack} onChange={setPPack}
            options={[{ v: '1', l: '1 л' }, { v: '2.5', l: '2,5 л' }, { v: '5', l: '5 л' }, { v: '10', l: '10 л' }]} />
        </div>
        <ResultBox
          lines={[[t.resultVolume, `${fmt1(primerL)} ${t.litres}`], [locale === 'ru' ? 'С запасом 5%' : 'З запасом 5%', `${primerPieces} ${t.pieces} × ${pPack} ${t.litres}`]]}
          cta={[{ href: `${shop}/gruntivky`, label: t.ctaPrimer }, { href: `${shop}/farby`, label: t.ctaPaint }]} />
      </div>

      <div style={card} id="glue">
        <CardHeader title={t.glue} desc={t.glueDesc} />
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Field label={t.glueLen} value={gLen} onChange={setGLen} />
          <Field label={t.diameter} value={gDia} onChange={setGDia} />
          <SelectField label={t.cartridge} value={gCart} onChange={setGCart}
            options={[{ v: '280', l: '280 мл' }, { v: '300', l: '300 мл' }, { v: '310', l: '310 мл' }]} />
        </div>
        <ResultBox
          lines={[[t.resultVolume, `${fmt1(glueMl)} ${t.ml}`], [t.resultPieces, `${gluePieces} ${t.pieces} × ${gCart} ${t.ml}`]]}
          cta={[{ href: `${shop}/montazhnyi-klei`, label: t.ctaGlue }]} />
      </div>

      <style>{`
        @media (max-width: 860px) {
          .calc-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
