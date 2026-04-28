'use client';

import { useState } from 'react';
import CategoryCarousel, { VISIBLE } from './CategoryCarousel';
import CategoryPreview from './CategoryPreview';
import type { Category, ProductFull } from '../../lib/supabase';
import type { UserRole } from '../../lib/user-role';

type Props = {
  categories: Category[];
  products: ProductFull[];
  role: UserRole;
};

export default function CategorySection({ categories, products, role }: Props) {
  const centerIndex = Math.floor(VISIBLE / 2) - 1; // 3rd card visible = index 2, minus __all__ = index 1
  const [selectedSlug, setSelectedSlug] = useState(categories[centerIndex]?.slug ?? categories[0]?.slug ?? '');

  return (
    <>
      <CategoryCarousel
        categories={categories}
        selectedSlug={selectedSlug}
        onSelect={setSelectedSlug}
        role={role}
      />
      <CategoryPreview
        categories={categories}
        products={products}
        selectedSlug={selectedSlug}
        role={role}
      />
    </>
  );
}
