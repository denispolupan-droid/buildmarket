import sharp from 'sharp';

const CANVAS = 800;      // final image is CANVAS x CANVAS
const INNER = 720;       // the trimmed product is scaled to fit inside this box
const MAX_UPSCALE = 6;   // sanity backstop only (e.g. an accidentally tiny/icon-sized upload) —
                         // every real product photo in the catalog needs well under this, so in
                         // practice every photo fills INNER fully and card borders line up exactly.
const WEBP_QUALITY = 90;

/**
 * Trims the uniform background around a product photo, then re-frames it onto a
 * fixed 800x800 white canvas so every product photo occupies a consistent share
 * of the frame — regardless of how tightly (or loosely) the source photo was
 * cropped by the supplier.
 *
 * Photos are scaled to fully fill INNER so every card lines up edge-to-edge in a
 * grid, even if that means enlarging a low-resolution source photo — a uniform,
 * slightly-soft grid reads far better than one where low-res photos leave a
 * visibly uneven gap. A sharpen pass afterward counteracts the softening.
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
    : await sharp(trimmed).resize(targetW, targetH, { kernel: 'lanczos3' }).sharpen({ sigma: 0.6 }).toBuffer();

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
