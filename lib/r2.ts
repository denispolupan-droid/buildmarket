import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME!;

// Returns the site-relative URL for this key — callers should not construct this
// themselves, since it must match the "/img/products/..." rewrite in next.config.ts.
// Default cache is a 1-year immutable — safe only because upload routes bake a content
// hash into the key. A fixed-name key (e.g. the promo banner) must pass a short
// cacheControl instead, since a hashless re-upload needs the old bytes to expire.
export async function uploadToR2(
  key: string, body: Buffer, contentType: string,
  cacheControl = 'public, max-age=31536000, immutable',
) {
  await r2Client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: cacheControl,
  }));
  return `/img/products/${key}`;
}

export async function deleteFromR2(keys: string[]) {
  await Promise.all(keys.map(key => r2Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))));
}
