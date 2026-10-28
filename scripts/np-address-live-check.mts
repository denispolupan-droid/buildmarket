// Живий read-only прогін резолвера вулиць НП по реальних кур'єрських адресах.
// Нічого не створює: лише searchSettlements / getWarehouses / getStreet /
// searchSettlementStreets. Запуск: npx tsx --env-file=.env.local scripts/np-address-live-check.mts
// Як в інших скриптах: під tsx іменовані експорти .ts приїжджають у .default
import * as npAddressNS from '../lib/np-address';
type Mod<T> = T & { default?: T };
const { parseAddress, resolveStreet, addressLabel } = ((npAddressNS as Mod<typeof npAddressNS>).default ?? npAddressNS);

const KEY = process.env.NOVA_POSHTA_API_KEY ?? '';
if (!KEY) { console.error('NOVA_POSHTA_API_KEY порожній'); process.exit(1); }

async function np(modelName: string, calledMethod: string, methodProperties: object) {
  const r = await fetch('https://api.novaposhta.ua/v2.0/json/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: KEY, modelName, calledMethod, methodProperties }),
  });
  return r.json() as Promise<{ success?: boolean; data?: unknown[]; errors?: string[] }>;
}

// [місто як у замовленні, delivery_address як у базі]
const CASES: [string, string][] = [
  ['Кременчук', 'Кременчук, просп. Полтавський, 2, кв. а'],
  ['Княжики', 'Княжики, вул. Антонюка, 16'],
  ['Коротич', 'Коротич, пров. Морозова, 8'],
  ['Дніпро', 'Дніпро, просп. Богдана Хмельницького, 24 А, кв. 70'],
  ['Харків', 'Харків, вул. Свинаренко Петра, 12а'],
  ['Токівське', 'Токівське, вул. Садова, 14'],
  ['Розкопанці', 'Розкопанці, Ігоря Гамарника, 12'],
  ['Київ', 'Київ, вул. Голосіївська, 9в'],
  ['Київ', 'Київ, просп. Відрадний, 59, кв. 216'],
  ['Київ', 'Київ, вул. Полкова, 43/10'],
  ['Харків', 'Харків, Ньютона, 123Б, кв. до будинку'],
  ['Київ', 'Київ, вул. Дегтярівська, 27т'],
  ['Мукачево', 'Мукачево, площа Паланок, буд.27'],
  ['Дніпро', 'Дніпро, вул. Надії Алексєєнко, 84'],
];

let ok = 0;
for (const [city, address] of CASES) {
  // Як модалка: перший населений пункт із searchSettlements за назвою міста
  const s = await np('Address', 'searchSettlements', { CityName: city, Limit: 5, Page: 1 });
  const sets = ((s.data?.[0] as { Addresses?: { Ref: string; Present: string; DeliveryCity: string }[] })?.Addresses ?? []);
  const set = sets.find(x => x.Present.startsWith(`м. ${city}`) || x.Present.startsWith(`с. ${city}`) || x.Present.startsWith(`смт ${city}`)) ?? sets[0];
  if (!set) { console.log(`✗ ${address} — населений пункт не знайдено`); continue; }
  // Як роут: SettlementRef → CityRef через склад
  const wh = await np('Address', 'getWarehouses', { SettlementRef: set.Ref, Limit: 1, Page: 1 });
  const cityRef = (wh.data?.[0] as { CityRef?: string })?.CityRef ?? set.DeliveryCity;
  const parsed = parseAddress(address, city);
  const found = await resolveStreet(np, { cityRef, settlementRef: set.Ref, parsed });
  if (found.kind === 'none') {
    console.log(`✗ ${address}\n    → ${JSON.stringify(parsed)} | підказки: ${found.suggestions.join('; ') || '—'}`);
  } else {
    ok++;
    console.log(`✓ ${address}\n    → [${found.kind}] ${addressLabel(found.label, parsed.house, parsed.flat)}  (${set.Present})`);
  }
}
console.log(`\n${ok}/${CASES.length} адрес зарезолвлено`);
