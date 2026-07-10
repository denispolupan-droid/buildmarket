import sharp from 'sharp';

const MAX_DIM = 400;
const WEBP_QUALITY = 92;

/**
 * Unlike product photos, brand logos keep their own transparency and aspect ratio —
 * they're rendered with objectFit:contain inside a fixed-size card, so there's no need
 * to pad them onto a fixed canvas. Just trim the excess border and cap the size.
 */
export async function normalizeBrandLogo(input: Buffer): Promise<Buffer> {
  const trimmed = await sharp(input, { failOn: 'none' }).trim({ threshold: 15 }).toBuffer();
  const { width, height } = await sharp(trimmed).metadata();
  if (!width || !height) throw new Error('Could not read image dimensions');

  const scale = Math.min(1, MAX_DIM / Math.max(width, height));
  const source = scale < 1
    ? sharp(trimmed).resize(Math.round(width * scale), Math.round(height * scale), { kernel: 'lanczos3' })
    : sharp(trimmed);

  return source.webp({ quality: WEBP_QUALITY }).toBuffer();
}
