'use client';

import { useState } from 'react';
import CategoryCarousel from './CategoryCarousel';
import CategoryPreview from './CategoryPreview';
import type { Category, ProductFull } from '../../lib/supabase';

type Props = {
  categories: Category[];
  products: ProductFull[];
};

export default function CategorySection({ categories, products }: Props) {
  const [selectedSlug, setSelectedSlug] = useState(categories[0]?.slug ?? '');

  return (
    <>
      <CategoryCarousel
        categories={categories}
        selectedSlug={selectedSlug}
        onSelect={setSelectedSlug}
      />
      <CategoryPreview
        categories={categories}
        products={products}
        selectedSlug={selectedSlug}
      />
    </>
  );
}
