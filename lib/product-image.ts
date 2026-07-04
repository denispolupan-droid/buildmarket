import sharp from 'sharp';

const CANVAS = 800;       // final image is CANVAS x CANVAS
const INNER = 720;        // the trimmed product is scaled to fit inside this box
const MAX_UPSCALE = 1.15; // never enlarge a trimmed photo by more than this — avoids blur
const WEBP_QUALITY = 90;

/**
 * Trims the uniform background around a product photo, then re-frames it onto a
 * fixed 800x800 white canvas so every product photo occupies a consistent share
 * of the frame — regardless of how tightly (or loosely) the source photo was
 * cropped by the supplier.
 *
 * Enlargement is capped at MAX_UPSCALE: a photo that was already tiny inside its
 * original frame is not blown up to match the others, since that just blurs it.
 * It gets a modest size boost (up to the cap) and extra centered padding instead.
 */
export async function normalizeProductImage(input: Buffer): Promise<Buffer> {
  const trimmed: Buffer = await sharp(input).trim({ threshold: 20 }).toBuffer();
  const { width: tw, height: th } = await sharp(trimmed).metadata();
  if (!tw || !th) throw new Error('Could not read image dimensions');

  const fitScale = Math.min(INNER / tw, INNER / th);
  const scale = Math.min(fitScale, MAX_UPSCALE);
  const targetW = Math.max(1, Math.round(tw * scale));
  const targetH = Math.max(1, Math.round(th * scale));

  const resizedContent: Buffer = scale === 1
    ? trimmed
    : await sharp(trimmed).resize(targetW, targetH).toBuffer();

  const padX = CANVAS - targetW;
  const padY = CANVAS - targetH;

  return sharp(resizedContent)
    .extend({
      top: Math.floor(padY / 2), bottom: Math.ceil(padY / 2),
      left: Math.floor(padX / 2), right: Math.ceil(padX / 2),
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}
