/**
 * Відправки Meest власним договором (13.11.2026): довідники, розрахунок,
 * створення посилки, стікер, трекінг — поверх lib/meest-api.
 *
 * Відправляємо з того самого пункту, що й Rozetka/Епіцентр: Партнерське №12,
 * Харків, вул. Хмельницького Богдана 32А (branchID нижче; змінюється в
 * app_settings.meest_sender_branch_id). Перевірено наживо: Харків №12 → Київ,
 * 1 кг — 50 ₴.
 */

import { meestFetch, meestFile, meestContractId } from './meest-api';
import { readSetting } from './secrets';
import { createServiceClient } from './supabase';

export const MEEST_SENDER_BRANCH_DEFAULT = { branchID: '9f631199-08c5-11ed-80e7-000c29800ae7', cityID: '87162365-749b-11df-b112-00215aee3ebe', title: 'Партнерське №12, Харків, вул. Хмельницького Богдана 32А' };

type Descr = { descrUA?: string; descrRU?: string; descrEN?: string; descrLoc?: string };
const ua = (d: Descr | string | undefined | null) => (typeof d === 'string' ? d : d?.descrUA ?? d?.descrLoc ?? '') || '';

export type MeestCity = { cityID: string; name: string; region: string; district: string; hasBranches: boolean };
export type MeestBranch = {
  branchID: string; cityID: string; number: string; type: string; title: string; address: string;
  postomat: boolean; open: boolean;
  limits: { weightPlaceMax?: number; volumePlaceMax?: number; length?: number; width?: number; height?: number } | null;
};

type RawCity = { cityID: string; cityDescr: Descr; regionDescr?: Descr; districtDescr?: Descr; isBranchInCity?: boolean };
type RawBranch = {
  branchID: string; cityID: string; branchNumber?: string; branchNo?: number; branchType?: string; ShortName?: string;
  branchDescr?: Descr; addressDescr?: Descr; building?: string; isBranchOpen?: boolean; isBranchClosed?: boolean;
  branchLimits?: { weightPlaceMax?: number; volumePlaceMax?: number; gabaritesMax?: { length?: number; width?: number; height?: number } };
};

const toCity = (c: RawCity): MeestCity => ({
  cityID: c.cityID, name: ua(c.cityDescr), region: ua(c.regionDescr), district: ua(c.districtDescr), hasBranches: c.isBranchInCity !== false,
});

/** Поштомат: тип «АПТ» (автоматичний поштовий термінал) або назва з «поштомат». */
export function isMeestPostomat(b: Pick<RawBranch, 'branchType' | 'ShortName'>): boolean {
  return /^АПТ$/i.test(b.branchType ?? '') || /поштомат/i.test(b.ShortName ?? '');
}

const toBranch = (b: RawBranch): MeestBranch => ({
  branchID: b.branchID, cityID: b.cityID,
  number: String(b.branchNumber ?? b.branchNo ?? ''),
  type: b.branchType ?? '',
  title: b.ShortName ?? ua(b.branchDescr),
  address: [ua(b.addressDescr), b.building].filter(Boolean).join(', '),
  postomat: isMeestPostomat(b),
  open: b.isBranchOpen !== false && !b.isBranchClosed,
  limits: b.branchLimits ? { weightPlaceMax: b.branchLimits.weightPlaceMax, volumePlaceMax: b.branchLimits.volumePlaceMax, ...b.branchLimits.gabaritesMax } : null,
});

/**
 * Пошук міста за початком назви. Meest шукає лише ТОЧНУ назву («хар» → нічого,
 * 13.11.2026), але приймає SQL-шаблон «%»: «хар%» + IsBranchInCity → Харків (без
 * російських селищ «Хара-Алдан»). Регістр не важливий; свої % і _ з вводу прибираємо.
 */
export async function meestSearchCities(q: string): Promise<MeestCity[]> {
  const name = q.trim().replace(/[%_]/g, '');
  if (name.length < 2) return [];
  const r = await meestFetch<RawCity[]>('/citySearch', { body: { filters: { cityDescr: `${name}%`, IsBranchInCity: true } } });
  const low = name.toLowerCase();
  return (Array.isArray(r) ? r : []).map(toCity)
    .sort((a, b) => Number(b.name.toLowerCase() === low) - Number(a.name.toLowerCase() === low) || a.name.length - b.name.length);
}

export async function meestBranches(cityID: string): Promise<MeestBranch[]> {
  const r = await meestFetch<RawBranch[]>('/branchSearch', { body: { filters: { cityID } } });
  return (Array.isArray(r) ? r : []).map(toBranch).filter(b => b.open)
    .sort((a, b) => (Number(a.number) || 9e9) - (Number(b.number) || 9e9));
}

export async function meestSenderBranch() {
  const id = await readSetting(createServiceClient(), 'meest_sender_branch_id');
  return id ? { ...MEEST_SENDER_BRANCH_DEFAULT, branchID: id } : MEEST_SENDER_BRANCH_DEFAULT;
}

/**
 * Пункт Meest з адреси замовлення маркетплейсу/сайту: місто й номер.
 * «Одеса, Відділення №128 (…)», «Мерефа, №6 (до 30 кг): …», «Київ, Поштомат №8059: …»,
 * «Запоріжжя (Запорізька обл., …), №108 (до 10 кг): …».
 */
export function parseMeestPoint(address: string | null | undefined, cityName?: string | null): { city: string; number: string; postomat: boolean } | null {
  const s = String(address ?? '');
  const num = s.match(/№\s*(\d{1,6})/);
  if (!num) return null;
  const city = (cityName ?? '').trim() || s.split(/[,(]/)[0].trim();
  if (!city) return null;
  return { city, number: num[1], postomat: /поштомат/i.test(s) };
}

/** Відділення за містом і номером (для автопідбору пункту одержувача). */
export async function meestFindPoint(city: string, number: string): Promise<{ city: MeestCity; branch: MeestBranch } | null> {
  const cities = await meestSearchCities(city);
  const exact = cities.filter(c => c.name.toLowerCase() === city.toLowerCase());
  for (const c of (exact.length ? exact : cities).slice(0, 3)) {
    const br = (await meestBranches(c.cityID)).find(b => b.number === number);
    if (br) return { city: c, branch: br };
  }
  return null;
}

export type MeestPlace = { weight: number; length: number; width: number; height: number; insurance: number };

/** Вартість і дата доставки (сервіс Branch → Branch). */
export async function meestCalculate(input: { receiverBranchID: string; receiverCityID: string; cod: number; places: MeestPlace[] }) {
  const sender = await meestSenderBranch();
  const r = await meestFetch<{ costServices?: string; estimatedDeliveryDate?: string }[] | { costServices?: string; estimatedDeliveryDate?: string }>('/calculate', { body: {
    contractID: await meestContractId(), COD: input.cod || 0,
    sender: { branchID: sender.branchID, cityID: sender.cityID, service: 'Branch' },
    receiver: { branchID: input.receiverBranchID, cityID: input.receiverCityID, service: 'Branch' },
    placesItems: input.places.map(p => ({ quantity: 1, weight: p.weight, length: p.length, width: p.width, height: p.height, insurance: p.insurance })),
  } });
  const row = Array.isArray(r) ? r[0] : r;
  return { cost: Number(row?.costServices ?? 0) || null, deliveryDate: row?.estimatedDeliveryDate ?? null };
}

export type MeestParcelInput = {
  orderNumber: number;
  sender: { name: string; phone: string };
  receiver: { name: string; phone: string; branchID: string };
  places: MeestPlace[];
  cod: number;
  /** Хто платить доставку: true — одержувач */
  receiverPays: boolean;
  description: string;
  notation?: string;
};

/** Тіло POST /parcel — чиста функція (перевіряється тестом). */
export function buildMeestParcelBody(input: MeestParcelInput, contractID: string, senderBranchID: string) {
  const vol = (p: MeestPlace) => Math.max(0.0001, Math.round((p.length * p.width * p.height) / 1e6 * 10000) / 10000);
  return {
    contractID,
    orderNumber: String(input.orderNumber),
    payType: 'noncash',
    receiverPay: input.receiverPays,
    COD: input.cod > 0 ? Math.round(input.cod * 100) / 100 : 0,
    info4Sticker: true,
    notation: input.notation ?? `Замовлення #${input.orderNumber}`,
    sender: { name: input.sender.name, phone: input.sender.phone, branchID: senderBranchID, service: 'Branch' },
    receiver: { name: input.receiver.name, phone: input.receiver.phone, branchID: input.receiver.branchID, service: 'Branch' },
    placesItems: input.places.map(p => ({
      quantity: 1, placeWeight: p.weight, weight: p.weight, placeVolume: vol(p), volume: vol(p),
      insurance: p.insurance, length: p.length, width: p.width, height: p.height,
    })),
    contentsItems: [{ contentName: input.description.slice(0, 100), quantity: 1, weight: input.places.reduce((s, p) => s + p.weight, 0), value: input.places.reduce((s, p) => s + p.insurance, 0) }],
  };
}

export async function meestCreateParcel(input: MeestParcelInput): Promise<{ parcelID: string; barCode: string; cost: number | null }> {
  const sender = await meestSenderBranch();
  const r = await meestFetch<{ parcelID?: string; barCode?: string; costServices?: number }>('/parcel', {
    body: buildMeestParcelBody(input, await meestContractId(), sender.branchID),
  });
  if (!r?.parcelID || !r.barCode) throw new Error('Meest не повернув номер посилки');
  return { parcelID: r.parcelID, barCode: r.barCode, cost: r.costServices != null ? Number(r.costServices) : null };
}

/** Видалити ще не зареєстровану посилку (до здачі на відділення). */
export async function meestDeleteParcel(parcelID: string): Promise<void> {
  await meestFetch(`/parcel/${encodeURIComponent(parcelID)}/${encodeURIComponent(await meestContractId())}`, { method: 'DELETE' });
}

/** Стікер 100×100 (PDF) — для кількох номерів через кому. */
export async function meestStickerPdf(barCodes: string[]): Promise<Buffer> {
  return meestFile(`/print/sticker100/${barCodes.map(encodeURIComponent).join(',')}?agent=${encodeURIComponent(await meestContractId())}`);
}

export type MeestTrackEvent = { eventDateTime?: string; eventCode?: number | string; eventDescr?: Descr; eventCityDescr?: Descr };

export async function meestTracking(trackNumber: string): Promise<MeestTrackEvent[]> {
  const r = await meestFetch<MeestTrackEvent[]>(`/tracking/${encodeURIComponent(trackNumber)}`);
  return Array.isArray(r) ? r : [];
}

export const meestEventText = (e: MeestTrackEvent) => ua(e.eventDescr);
export const meestEventCity = (e: MeestTrackEvent) => ua(e.eventCityDescr);
