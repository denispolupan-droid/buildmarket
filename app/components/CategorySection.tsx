'use client';

import { useState } from 'react';
import CategoryCarousel, { VISIBLE } from './CategoryCarousel';
import CategoryPreview from './CategoryPreview';
import type { Category, ProductFull } from '../../lib/supabase';
import type { UserRole } from '../../lib/user-role';

type Props = {
  categories: Category[];     // всі категорії (включно з підкатегоріями)
  products: ProductFull[];
  role: UserRole;
};

export default function CategorySection({ categories, products, role }: Props) {
  const parentCats = categories.filter(c => !c.parent_slug);
  const centerIndex = Math.floor(VISIBLE / 2) - 1;
  const [selectedSlug, setSelectedSlug] = useState(parentCats[centerIndex]?.slug ?? parentCats[0]?.slug ?? '');

  return (
    <>
      <CategoryCarousel
        categories={parentCats}
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
