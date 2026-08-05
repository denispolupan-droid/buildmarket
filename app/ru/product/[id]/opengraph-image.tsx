import { productOgImage, OG_SIZE } from '../../../product/[id]/og-image';

// Російська og-картка: назва товару з name_ru і російський слоган —
// раніше ru-сторінки посилалися на картинку, якої за /ru-шляхом не існувало
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image({ params }: { params: Promise<{ id: string }> }) {
  return productOgImage(params, 'ru');
}
