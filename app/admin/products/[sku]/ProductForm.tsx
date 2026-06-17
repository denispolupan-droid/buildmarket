'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Save, Trash2, Plus, X, Loader2, Wand2, Upload } from 'lucide-react';
import { showToast } from '../../../../lib/toast';
import type { ProductFull, Category, ProductCharacteristic } from '../../../../types';
import CharValueInput from './CharValueInput';

type Props = {
  product: ProductFull | null;
  categories: Category[];
  isNew: boolean;
  promUrls?: { url: string; name: string }[];
};

const inputStyle: React.CSSProperties = {
  width: '100%', height: '44px', padding: '0 14px',
  borderRadius: '8px', border: '1px solid var(--border)',
  fontSize: '14px', outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '13px', fontWeight: 600,
  color: 'var(--text-secondary)', marginBottom: '6px',
};

const sectionStyle: React.CSSProperties = {
  background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)',
  padding: '24px', marginBottom: '20px',
};

export default function ProductForm({ product, categories, isNew, promUrls = [] }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [saving, setSaving] = useState(false);

  const [sku, setSku] = useState(product?.sku ?? (isNew ? (searchParams.get('sku') ?? '') : ''));
  const [name, setName] = useState(product?.name ?? (isNew ? (searchParams.get('name') ?? '') : ''));
  const [nameRu, setNameRu] = useState(product?.name_ru ?? '');
  const [brand, setBrand] = useState(product?.brand ?? '');
  const [categorySlug, setCategorySlug] = useState(product?.category_slug ?? '');
  const [productType, setProductType] = useState(product?.product_type ?? '');
  const [volume, setVolume] = useState(product?.volume ?? '');
  const [packQty, setPackQty] = useState(product?.pack_qty ?? 1);
  const [minOrder, setMinOrder] = useState(product?.min_order ?? 1);
  const [description, setDescription] = useState(product?.description ?? '');
  const [descriptionRu, setDescriptionRu] = useState(product?.description_ru ?? '');
  const [descriptionFull, setDescriptionFull] = useState(product?.description_full ?? '');
  const [descriptionFullRu, setDescriptionFullRu] = useState(product?.description_full_ru ?? '');
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  const [isHit, setIsHit] = useState(product?.is_hit ?? false);
  const [isNewBadge, setIsNewBadge] = useState(product?.is_new ?? false);
  const [sortOrder, setSortOrder] = useState(product?.sort_order ?? 0);

  const [imgType, setImgType] = useState<'tube' | 'canister'>(product?.img_type ?? 'tube');
  const [bc, setBc] = useState(product?.bc ?? '#FFFFFF');
  const [ac, setAc] = useState(product?.ac ?? '#333333');
  const [nl1, setNl1] = useState(product?.nl1 ?? '');
  const [nl2, setNl2] = useState(product?.nl2 ?? '');
  const [imageUrl, setImageUrl] = useState(product?.image ?? '');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [promKeywords, setPromKeywords] = useState((product as any)?.keywords ?? '');
  const [promKeywordsRu, setPromKeywordsRu] = useState((product as any)?.keywords_ru ?? '');
  const [promPortalUrl, setPromPortalUrl] = useState((product as any)?.prom_portal_url ?? '');

  const categoryPromUrl = categories.find(c => c.slug === categorySlug)?.prom_section_url ?? null;

  const [priceUnit, setPriceUnit] = useState(product?.stock?.price_unit ?? 0);
  const [priceOld, setPriceOld] = useState(product?.stock?.price_old ?? 0);
  const [priceRetail, setPriceRetail] = useState(product?.stock?.price_retail ?? 0);
  const [priceRetailOld, setPriceRetailOld] = useState(product?.stock?.price_retail_old ?? 0);
  const [priceDrop, setPriceDrop] = useState(product?.stock?.price_drop ?? 0);
  const [priceCost, setPriceCost] = useState(product?.stock?.price_cost ?? (isNew ? Number(searchParams.get('price_cost') ?? 0) : 0));
  const [stockQty, setStockQty] = useState(product?.stock?.stock_qty ?? 0);
  const [stockStatus, setStockStatus] = useState(product?.stock?.stock_status ?? 'in_stock');
  const [supplierSku, setSupplierSku] = useState(product?.stock?.supplier_sku ?? '');

  const [chars, setChars] = useState<{ label: string; value: string }[]>(
    product?.characteristics?.map(c => ({ label: c.label, value: c.value })) ?? []
  );
  const [loadingChars, setLoadingChars] = useState(false);

  const parentCats = categories.filter(c => !c.parent_slug);
  const childrenOf: Record<string, Category[]> = {};
  categories.forEach(c => {
    if (c.parent_slug) (childrenOf[c.parent_slug] ??= []).push(c);
  });

  const fetchBrandColors = useCallback(async (brandName: string) => {
    if (!brandName.trim() || !isNew) return;
    try {
      const res = await fetch(`/api/admin/products/defaults?brand=${encodeURIComponent(brandName)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.bc) setBc(data.bc);
        if (data.ac) setAc(data.ac);
      }
    } catch {}
  }, [isNew]);

  const fetchCategoryChars = useCallback(async (catSlug: string) => {
    if (!catSlug) return [];
    try {
      const res = await fetch(`/api/admin/products/defaults?category=${encodeURIComponent(catSlug)}`);
      if (res.ok) {
        const data = await res.json();
        return data.characteristics ?? [];
      }
    } catch {}
    return [];
  }, []);

  const loadCategoryDefaults = async () => {
    if (!categorySlug) {
      alert('Спочатку виберіть категорію');
      return;
    }
    setLoadingChars(true);
    try {
      const defaultLabels = await fetchCategoryChars(categorySlug);
      if (defaultLabels.length > 0) {
        const existingLabels = new Set(chars.map(c => c.label));
        const newChars = defaultLabels
          .filter((label: string) => !existingLabels.has(label))
          .map((label: string) => ({ label, value: '' }));
        if (newChars.length > 0) {
          setChars([...chars, ...newChars]);
        } else {
          alert('Всі характеристики вже додані');
        }
      } else {
        alert('Характеристик для цієї категорії не знайдено');
      }
    } catch {
      alert('Помилка завантаження');
    }
    setLoadingChars(false);
  };

  useEffect(() => {
    if (isNew && brand.trim().length >= 2) {
      const timer = setTimeout(() => fetchBrandColors(brand), 500);
      return () => clearTimeout(timer);
    }
  }, [brand, isNew, fetchBrandColors]);

  function addChar() {
    setChars([...chars, { label: '', value: '' }]);
  }

  function removeChar(index: number) {
    setChars(chars.filter((_, i) => i !== index));
  }

  function updateChar(index: number, field: 'label' | 'value', val: string) {
    setChars(chars.map((c, i) => i === index ? { ...c, [field]: val } : c));
  }

  async function handleImageUpload(file: File) {
    if (!brand.trim()) { showToast('Спочатку вкажіть бренд', 'error'); return; }
    // Для існуючих товарів — завжди оригінальний SKU/бренд, не форм-стейт
    const skuVal  = isNew ? (sku.trim() || 'new') : (product?.sku  ?? sku.trim());
    const brandVal = isNew ? brand.trim() : (product?.brand ?? brand).trim();
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('brand', brandVal);
      fd.append('sku', skuVal);
      const res = await fetch('/api/admin/products/upload-image', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? 'Помилка завантаження', 'error'); return; }
      setImageUrl(data.imageUrl);
      showToast('Фото завантажено', 'success');
    } catch {
      showToast('Помилка з\'єднання', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!isNew && !sku.trim()) { showToast('SKU обов\'язковий', 'error'); return; }
    if (!name.trim()) { showToast('Назва обов\'язкова', 'error'); return; }
    if (!brand.trim()) { showToast('Бренд обов\'язковий', 'error'); return; }

    setSaving(true);

    try {
      const res = await fetch('/api/admin/products', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku,
          product: {
            sku, name, brand,
            category_slug: categorySlug || null,
            product_type: productType || null,
            volume: volume || null,
            pack_qty: packQty,
            min_order: minOrder,
            name_ru: nameRu || null,
            description: description || null,
            description_ru: descriptionRu || null,
            description_full: descriptionFull || null,
            description_full_ru: descriptionFullRu || null,
            is_active: isActive,
            is_hit: isHit,
            is_new: isNewBadge,
            sort_order: sortOrder,
            img_type: imgType,
            bc, ac,
            nl1: nl1 || null,
            nl2: nl2 || null,
            image: imageUrl || null,
            keywords: promKeywords || null,
            keywords_ru: promKeywordsRu || null,
            prom_portal_url: promPortalUrl || null,
          },
          stock: {
            sku,
            price_unit: priceUnit,
            price_old: priceOld || null,
            price_retail: priceRetail || null,
            price_retail_old: priceRetailOld || null,
            price_drop: priceDrop || null,
            price_cost: priceCost || null,
            stock_qty: stockQty,
            stock_status: stockStatus,
            supplier_sku: supplierSku || null,
          },
          characteristics: chars.filter(c => c.label.trim() && c.value.trim()),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error ?? 'Помилка збереження', 'error');
        setSaving(false);
        return;
      }

      const generatedSku = data.sku || sku;
      showToast(`Збережено! SKU: ${generatedSku}`, 'success');
      setSaving(false);

      setTimeout(() => {
        router.push('/admin/products');
      }, 800);
    } catch (e) {
      showToast('Помилка з\'єднання', 'error');
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Видалити цей товар? Цю дію неможливо скасувати.')) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/products?sku=${sku}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/admin/products');
      } else {
        showToast('Помилка видалення', 'error');
        setSaving(false);
      }
    } catch {
      showToast('Помилка з\'єднання', 'error');
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Basic Info */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '20px' }}>Основна інформація</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={labelStyle}>SKU (артикул){!isNew && ' *'}</label>
            {isNew ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  value={sku}
                  onChange={e => setSku(e.target.value)}
                  placeholder="Авто"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  або залиште пустим
                </span>
              </div>
            ) : (
              <input
                type="text"
                value={sku}
                disabled
                style={{ ...inputStyle, background: 'var(--bg-soft)' }}
              />
            )}
          </div>
          <div>
            <label style={labelStyle}>Назва товару *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Назва товару (рос.) — для /ru/</label>
          <input type="text" value={nameRu} onChange={e => setNameRu(e.target.value)} placeholder="Якщо порожньо — буде використано українську назву" style={inputStyle} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={labelStyle}>Бренд *</label>
            <input type="text" value={brand} onChange={e => setBrand(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Категорія</label>
            <select value={categorySlug} onChange={e => setCategorySlug(e.target.value)} style={inputStyle}>
              <option value="">— Без категорії —</option>
              {parentCats.map(cat => (
                <optgroup key={cat.slug} label={cat.name}>
                  <option value={cat.slug}>{cat.name}</option>
                  {(childrenOf[cat.slug] ?? []).map(child => (
                    <option key={child.slug} value={child.slug}>↳ {child.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Тип продукту</label>
            <input type="text" value={productType} onChange={e => setProductType(e.target.value)} style={inputStyle} placeholder="напр. Силіконовий герметик" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={labelStyle}>Об&apos;єм / Вага</label>
            <input type="text" value={volume} onChange={e => setVolume(e.target.value)} style={inputStyle} placeholder="напр. 280 мл" />
          </div>
          <div>
            <label style={labelStyle}>В упаковці (шт)</label>
            <input type="number" value={packQty} onChange={e => setPackQty(Number(e.target.value))} style={inputStyle} min={1} />
          </div>
          <div>
            <label style={labelStyle}>Мін. замовлення</label>
            <input type="number" value={minOrder} onChange={e => setMinOrder(Number(e.target.value))} style={inputStyle} min={1} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={labelStyle}>Опис (укр)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              style={{ ...inputStyle, height: 'auto', padding: '12px 14px', resize: 'vertical' }}
            />
          </div>
          <div>
            <label style={labelStyle}>Опис (рус)</label>
            <textarea
              value={descriptionRu}
              onChange={e => setDescriptionRu(e.target.value)}
              rows={3}
              style={{ ...inputStyle, height: 'auto', padding: '12px 14px', resize: 'vertical' }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={labelStyle}>Повний опис (укр)</label>
            <textarea
              value={descriptionFull}
              onChange={e => setDescriptionFull(e.target.value)}
              rows={5}
              style={{ ...inputStyle, height: 'auto', padding: '12px 14px', resize: 'vertical' }}
            />
          </div>
          <div>
            <label style={labelStyle}>Повний опис (рус)</label>
            <textarea
              value={descriptionFullRu}
              onChange={e => setDescriptionFullRu(e.target.value)}
              rows={5}
              style={{ ...inputStyle, height: 'auto', padding: '12px 14px', resize: 'vertical' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Активний (відображається на сайті)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={isHit} onChange={e => setIsHit(e.target.checked)} style={{ accentColor: '#F97316' }} />
            <span style={{ fontSize: '14px', fontWeight: isHit ? 700 : 400, color: isHit ? '#EA580C' : 'var(--text-secondary)' }}>🔥 ХІТ</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={isNewBadge} onChange={e => setIsNewBadge(e.target.checked)} style={{ accentColor: '#22C55E' }} />
            <span style={{ fontSize: '14px', fontWeight: isNewBadge ? 700 : 400, color: isNewBadge ? '#16A34A' : 'var(--text-secondary)' }}>✨ НОВИНКА</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Сортування:</label>
            <input type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))} style={{ ...inputStyle, width: '80px' }} />
          </div>
        </div>
      </div>

      {/* Marketplaces */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Маркетплейси</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
          Ці поля виводяться у YML фід для Prom.ua та інших маркетплейсів. Характеристики та ціни беруться з відповідних секцій автоматично.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>
              Пошукові запити Prom.ua (укр){' '}
              <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>— через кому</span>
            </label>
            <textarea
              value={promKeywords}
              onChange={e => setPromKeywords(e.target.value)}
              rows={3}
              placeholder="герметик силіконовий білий, герметик для ванни, силіконовий герметик санітарний"
              style={{ ...inputStyle, height: 'auto', padding: '12px 14px', resize: 'vertical' }}
            />
          </div>
          <div>
            <label style={labelStyle}>
              Пошукові запити Prom.ua (рос){' '}
              <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>— через кому</span>
            </label>
            <textarea
              value={promKeywordsRu}
              onChange={e => setPromKeywordsRu(e.target.value)}
              rows={3}
              placeholder="силиконовый герметик белый, герметик для ванны, санитарный герметик"
              style={{ ...inputStyle, height: 'auto', padding: '12px 14px', resize: 'vertical' }}
            />
          </div>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Рекомендовано 5–10 запитів: назва + синоніми + область застосування. Рос. запити потрапляють у <code>keywords_ru</code> фіду.
        </p>
        <div style={{ marginTop: '16px' }}>
          <label style={labelStyle}>
            Розділ Prom (portal_url){' '}
            <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>— залиш порожнім для автоматичного з категорії</span>
          </label>
          <input
            type="text"
            list="prom-urls-datalist"
            value={promPortalUrl}
            onChange={e => setPromPortalUrl(e.target.value)}
            placeholder={categoryPromUrl ?? 'https://prom.ua/...'}
            style={inputStyle}
          />
          {promUrls.length > 0 && (
            <datalist id="prom-urls-datalist">
              {promUrls.map(({ url, name }) => (
                <option key={url} value={url}>{name}</option>
              ))}
            </datalist>
          )}
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Якщо вказано — цей товар потрапить саме в цей розділ Prom, ігноруючи налаштування категорії.
            Підказки беруться з налаштувань категорій (розділ <em>Prom → Комісії</em>).
          </p>
        </div>
      </div>

      {/* Pricing & Stock */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '20px' }}>Ціни та залишки</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={labelStyle}>Оптова ціна (грн)</label>
            <input type="number" value={priceUnit} onChange={e => setPriceUnit(Number(e.target.value))} style={inputStyle} min={0} step={0.01} />
          </div>
          <div>
            <label style={labelStyle}>Стара оптова</label>
            <input type="number" value={priceOld} onChange={e => setPriceOld(Number(e.target.value))} style={inputStyle} min={0} step={0.01} />
          </div>
          <div>
            <label style={labelStyle}>Собівартість</label>
            <input type="number" value={priceCost} onChange={e => setPriceCost(Number(e.target.value))} style={inputStyle} min={0} step={0.01} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={labelStyle}>Роздрібна ціна (грн)</label>
            <input type="number" value={priceRetail} onChange={e => setPriceRetail(Number(e.target.value))} style={inputStyle} min={0} step={0.01} />
          </div>
          <div>
            <label style={labelStyle}>Стара роздрібна</label>
            <input type="number" value={priceRetailOld} onChange={e => setPriceRetailOld(Number(e.target.value))} style={inputStyle} min={0} step={0.01} />
          </div>
          <div>
            <label style={labelStyle}>Ціна дропшипінг</label>
            <input type="number" value={priceDrop} onChange={e => setPriceDrop(Number(e.target.value))} style={inputStyle} min={0} step={0.01} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Статус наявності</label>
            <select value={stockStatus} onChange={e => setStockStatus(e.target.value as 'in_stock' | 'out_of_stock' | 'on_order')} style={inputStyle}>
              <option value="in_stock">В наявності</option>
              <option value="out_of_stock">Немає в наявності</option>
              <option value="on_order">Під замовлення</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Артикул постачальника</label>
            <input type="text" value={supplierSku} onChange={e => setSupplierSku(e.target.value)} style={inputStyle} placeholder="напр. SUP-12345" />
          </div>
        </div>
      </div>

      {/* Image Settings */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '20px' }}>Зображення</h2>

        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>Фото товару</label>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            {/* Preview */}
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl.startsWith('/') ? imageUrl : imageUrl}
                alt="preview"
                style={{ width: 80, height: 80, objectFit: 'contain', borderRadius: 8,
                  border: '1px solid var(--border)', background: '#f8fafc', flexShrink: 0 }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Upload button */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ''; }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  height: '44px', padding: '0 18px', borderRadius: '8px',
                  border: '1px solid var(--border)', background: 'var(--bg-soft)',
                  fontSize: '14px', fontWeight: 600, cursor: uploading ? 'wait' : 'pointer',
                  color: 'var(--text-primary)', opacity: uploading ? 0.6 : 1,
                }}
              >
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {uploading ? 'Завантаження...' : 'Завантажити фото'}
              </button>
              {/* Manual URL */}
              <input
                type="text"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                style={{ ...inputStyle, fontSize: '12px', color: 'var(--text-secondary)' }}
                placeholder="/img/products/brand/sku.webp"
              />
            </div>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
            JPG / PNG / WebP — автоматично конвертується у WebP 800×800
          </p>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Або налаштуйте автогенероване зображення:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={labelStyle}>Тип</label>
            <select value={imgType} onChange={e => setImgType(e.target.value as 'tube' | 'canister')} style={inputStyle}>
              <option value="tube">Туба</option>
              <option value="canister">Каністра</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Колір фону (BC)</label>
            <input type="color" value={bc} onChange={e => setBc(e.target.value)} style={{ ...inputStyle, padding: '4px' }} />
          </div>
          <div>
            <label style={labelStyle}>Колір акценту (AC)</label>
            <input type="color" value={ac} onChange={e => setAc(e.target.value)} style={{ ...inputStyle, padding: '4px' }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Текст 1 (NL1)</label>
            <input type="text" value={nl1} onChange={e => setNl1(e.target.value)} style={inputStyle} placeholder="Основний текст на етикетці" />
          </div>
          <div>
            <label style={labelStyle}>Текст 2 (NL2)</label>
            <input type="text" value={nl2} onChange={e => setNl2(e.target.value)} style={inputStyle} placeholder="Додатковий текст" />
          </div>
        </div>
      </div>

      {/* Characteristics */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Характеристики</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={loadCategoryDefaults}
              disabled={loadingChars}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '8px 14px', borderRadius: '8px', border: '1px solid #E0E7FF',
                background: '#EEF2FF', fontSize: '13px', fontWeight: 600, color: '#4F46E5',
                cursor: loadingChars ? 'wait' : 'pointer',
                opacity: loadingChars ? 0.7 : 1,
              }}
            >
              {loadingChars ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              З категорії
            </button>
            <button
              onClick={addChar}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)',
                background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              <Plus size={14} /> Додати
            </button>
          </div>
        </div>

        {chars.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Характеристик немає. Натисніть {'"'}Додати{'"'} щоб створити.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {chars.map((char, i) => (
              <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input
                  type="text"
                  value={char.label}
                  onChange={e => updateChar(i, 'label', e.target.value)}
                  placeholder="Назва характеристики"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <CharValueInput
                  label={char.label}
                  value={char.value}
                  onChange={val => updateChar(i, 'value', val)}
                  style={inputStyle}
                />
                <button
                  onClick={() => removeChar(i)}
                  style={{
                    width: '44px', height: '44px', borderRadius: '8px', border: '1px solid #FECACA',
                    background: '#FEF2F2', color: '#DC2626', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px' }}>
        {!isNew && (
          <button
            onClick={handleDelete}
            disabled={saving}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              height: '48px', padding: '0 20px', borderRadius: '10px',
              border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626',
              fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Trash2 size={16} /> Видалити товар
          </button>
        )}
        <div style={{ marginLeft: 'auto' }} />
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            height: '48px', padding: '0 28px', borderRadius: '10px',
            background: '#1E3A5F', color: '#fff', border: 'none',
            fontSize: '14px', fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {isNew ? 'Створити товар' : 'Зберегти зміни'}
        </button>
      </div>
    </div>
  );
}
