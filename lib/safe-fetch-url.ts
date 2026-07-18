// Захист від SSRF при fetch URL, заданого користувачем (напр. supplier.source_url).
// Дозволяємо лише http/https і відхиляємо звернення на приватні / loopback / link-local
// адреси. Admin-only, тож це defense-in-depth; повний захист від DNS-rebinding вимагав би
// резолву та піннінгу IP — тут блокуємо принаймні прямі приватні цілі та не-http схеми.

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h === '0.0.0.0') return true;
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // IPv6 unique-local
  if (h.startsWith('fe80')) return true;                     // IPv6 link-local

  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10) return true;
    if (a === 127) return true;                       // loopback
    if (a === 169 && b === 254) return true;          // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true;          // private
    if (a === 0) return true;
  }
  return false;
}

/** Throws if the URL is not a public http(s) target. Returns the parsed URL otherwise. */
export function assertPublicUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('Некоректний URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`Недозволена схема URL: ${u.protocol}`);
  }
  if (isPrivateHost(u.hostname)) {
    throw new Error('URL вказує на приватну/локальну адресу');
  }
  return u;
}
