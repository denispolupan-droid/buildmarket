'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import ProductImage from './ProductImage';
import type { ProductPublic } from '../../types';

/**
 * Стрічка хітів праворуч від пошуку: міні-картки (фото + ціна) з
 * горизонтальною прокруткою. Стрілки ненавʼязливі (без рамок): права зникає
 * в кінці стрічки, ліва зʼявляється після прокрутки. Джерело — закріплена
 * вітрина магазину (адмінка «Вітрина»), до 20 позицій.
 */
type Props = {
  products: ProductPublic[];
  lang: 'uk' | 'ru';
};

export default function HeroHitChips({ products, lang }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const prefix = lang === 'ru' ? '/ru' : '';

  function updateArrows() {
    const el = trackRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 8);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  }

  useEffect(() => {
    updateArrows();
    window.addEventListener('resize', updateArrows);
    return () => window.removeEventListener('resize', updateArrows);
  }, [products.length]);

  if (products.length === 0) return null;

  const scroll = (dir: 1 | -1) =>
    trackRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });

  return (
    <div className="home-hit-chips">
      <Link href={`${prefix}/shop`} className="home-hit-chips__label">
        <Flame size={14} strokeWidth={2.25} />
        {lang === 'ru' ? 'Хиты' : 'Хіти'}
      </Link>

      <div className={`home-hit-scroll${canLeft ? ' has-left' : ''}${canRight ? ' has-right' : ''}`}>
        <div className="home-hit-track" ref={trackRef} onScroll={updateArrows}>
          {products.map(p => {
            const price = p.stock?.price_promo ?? p.stock?.price_retail;
            const name = lang === 'ru' ? (p.name_ru ?? p.name) : p.name;
            if (price == null) return null;
            return (
              <Link key={p.sku} href={`${prefix}/product/${p.slug ?? p.sku}`} className="home-hit-card" title={name}>
                <span className="home-hit-card__img">
                  <ProductImage
                    brand={p.brand} nl1={p.nl1 ?? ''} nl2={p.nl2 ?? undefined}
                    volume={p.volume ?? ''} bc={p.bc} ac={p.ac} type={p.img_type}
                    variant="front" imageUrl={p.image ?? undefined}
                  />
                </span>
                <span className="home-hit-card__price">{price} грн</span>
              </Link>
            );
          })}
        </div>
        {canLeft && (
          <button type="button" className="home-hit-nav home-hit-nav--prev" onClick={() => scroll(-1)}
            aria-label={lang === 'ru' ? 'Назад' : 'Назад'}>
            <ChevronLeft size={18} strokeWidth={2.25} />
          </button>
        )}
        {canRight && (
          <button type="button" className="home-hit-nav home-hit-nav--next" onClick={() => scroll(1)}
            aria-label={lang === 'ru' ? 'Показать ещё' : 'Показати ще'}>
            <ChevronRight size={18} strokeWidth={2.25} />
          </button>
        )}
      </div>
    </div>
  );
}
