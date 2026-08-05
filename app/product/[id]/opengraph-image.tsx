import { productOgImage, OG_SIZE } from './og-image';

export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image({ params }: { params: Promise<{ id: string }> }) {
  return productOgImage(params, 'uk');
}
