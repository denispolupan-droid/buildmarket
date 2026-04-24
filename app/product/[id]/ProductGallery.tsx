'use client';

import { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import ProductImage from '../../components/ProductImage';
import type { ProductFull } from '../../../lib/supabase';

type Props = {
  product: ProductFull;
  priceOld: number | null;
  priceUnit: number;
};

export default function ProductGallery({ product, priceOld, priceUnit }: Props) {
  const [lightbox, setLightbox] = useState(false);
  const hasRealImage = !!product.image;

  const thumbVariants = (['front', 'angle', 'label', 'angle'] as const);

  return (
    <>
      <div className="product-gallery">
        <div
          className="product-gallery__main"
          style={{ cursor: 'zoom-in' }}
          onClick={() => setLightbox(true)}
        >
          <ProductImage
            brand={product.brand} nl1={product.nl1 ?? ''} nl2={product.nl2 ?? undefined}
            volume={product.volume ?? ''} bc={product.bc} ac={product.ac}
            type={product.img_type} variant="front"
            imageUrl={product.image ?? undefined}
          />
          {priceOld && priceUnit > 0 && (
            <span className="product-gallery__badge">
              -{Math.round((1 - priceUnit / priceOld) * 100)}%
            </span>
          )}
          <div style={{
            position: 'absolute', bottom: '10px', right: '10px',
            background: 'rgba(0,0,0,0.35)', borderRadius: '6px',
            padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <Maximize2 size={16} color="#fff" strokeWidth={2} />
          </div>
        </div>

        {!hasRealImage && (
          <div className="product-gallery__thumbs">
            {thumbVariants.map((variant, i) => (
              <div key={i} className={'product-gallery__thumb' + (i === 0 ? ' is-active' : '')}>
                <ProductImage
                  brand={product.brand} nl1={product.nl1 ?? ''} nl2={product.nl2 ?? undefined}
                  volume={product.volume ?? ''} bc={product.bc} ac={product.ac}
                  type={product.img_type} variant={variant}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <div style={{
            maxWidth: '80vw', maxHeight: '80vh',
            background: '#fff', borderRadius: '16px',
            padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: '500px', height: '500px', maxWidth: '70vw', maxHeight: '70vh' }}>
              <ProductImage
                brand={product.brand} nl1={product.nl1 ?? ''} nl2={product.nl2 ?? undefined}
                volume={product.volume ?? ''} bc={product.bc} ac={product.ac}
                type={product.img_type} variant="front"
                imageUrl={product.image ?? undefined}
              />
            </div>
          </div>
          <button
            aria-label="Закрити перегляд"
            onClick={() => setLightbox(false)}
            style={{
              position: 'fixed', top: '24px', right: '32px',
              background: 'rgba(255,255,255,0.15)', border: 'none',
              color: '#fff', fontSize: '28px', cursor: 'pointer',
              borderRadius: '50%', width: '44px', height: '44px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
