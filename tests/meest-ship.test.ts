import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ createServiceClient: () => ({}) }));
vi.mock('../lib/secrets', () => ({ readSetting: async () => null, writeSetting: async () => {} }));

import { parseMeestPoint, buildMeestParcelBody, isMeestPostomat } from '../lib/meest-ship';
import { formatMeestDoorAddress, parseMeestDoorAddress } from '../lib/meest-address';

describe('parseMeestPoint — пункт Meest з адреси замовлення', () => {
  it('Rozetka / Prom / Епіцентр — місто й номер', () => {
    expect(parseMeestPoint('Одеса, Відділення №128 (Сільпоінт , ТРЦ City Center), просп. Небесної Сотні, 2', 'Одеса'))
      .toEqual({ city: 'Одеса', number: '128', postomat: false });
    expect(parseMeestPoint('Запоріжжя (Запорізька обл., Запорізький р-н.), №108 (до 10 кг): вул. Руставі, 1Г', null))
      .toEqual({ city: 'Запоріжжя', number: '108', postomat: false });
    expect(parseMeestPoint('Київ, Поштомат №8059: просп. Броварський, 17', 'Київ'))
      .toEqual({ city: 'Київ', number: '8059', postomat: true });
  });
  it('без номера — null', () => {
    expect(parseMeestPoint('Київ, вул. Хрещатик 1', 'Київ')).toBeNull();
    expect(parseMeestPoint(null)).toBeNull();
  });
});

describe('isMeestPostomat', () => {
  it('АПТ або «поштомат» у назві', () => {
    expect(isMeestPostomat({ branchType: 'АПТ', ShortName: 'Поштомат №8059, Київ' })).toBe(true);
    expect(isMeestPostomat({ branchType: 'Міні-відділення', ShortName: 'Партнерське №128' })).toBe(false);
  });
});

describe('buildMeestParcelBody — тіло POST /parcel', () => {
  const body = buildMeestParcelBody({
    orderNumber: 26111090,
    sender: { name: 'Полупан Денис Олександрович', phone: '+380991997788' },
    receiver: { name: 'Іван Петренко', phone: '+380671112233', branchID: 'BR-1' },
    places: [{ weight: 1.2, length: 30, width: 20, height: 15, insurance: 925 }],
    cod: 925, receiverPays: true, description: 'Клей Lacrysil',
  }, 'CONTRACT', 'SENDER-BR');

  it('договір, відділення відправника й одержувача, сервіс Branch', () => {
    expect(body.contractID).toBe('CONTRACT');
    expect(body.sender).toMatchObject({ branchID: 'SENDER-BR', service: 'Branch' });
    expect(body.receiver).toMatchObject({ branchID: 'BR-1', service: 'Branch', phone: '+380671112233' });
    expect(body.orderNumber).toBe('26111090');
  });
  it('післяплата, платник, місце з об’ємом у м³', () => {
    expect(body.COD).toBe(925);
    expect(body.receiverPay).toBe(true);
    expect(body.placesItems[0]).toMatchObject({ quantity: 1, placeWeight: 1.2, placeVolume: 0.009, insurance: 925, length: 30 });
  });
  it('без післяплати — 0', () => {
    const b = buildMeestParcelBody({ orderNumber: 1, sender: { name: 'a', phone: 'b' }, receiver: { name: 'c', phone: 'd', branchID: 'e' }, places: [{ weight: 1, length: 10, width: 10, height: 10, insurance: 0 }], cod: 0, receiverPays: false, description: 'x' }, 'C', 'S');
    expect(b.COD).toBe(0);
    expect(b.receiverPay).toBe(false);
  });
});

describe("кур'єр Meest — адреса й тіло посилки", () => {
  it("формат і розбір адреси «вул. …, буд. …, кв. …»", () => {
    const a = formatMeestDoorAddress("вул. Хрещатик", "12А", "5");
    expect(a).toBe("вул. Хрещатик, буд. 12А, кв. 5");
    expect(parseMeestDoorAddress(a)).toEqual({ street: "вул. Хрещатик", building: "12А", flat: "5" });
    expect(parseMeestDoorAddress(formatMeestDoorAddress("просп. Науки", "1", ""))).toEqual({ street: "просп. Науки", building: "1", flat: null });
    expect(parseMeestDoorAddress("Київ, Відділення №5")).toBeNull();
  });
  it("Door: вулиця, будинок, квартира; без branchID", () => {
    const b = buildMeestParcelBody({ orderNumber: 1, sender: { name: "a", phone: "b" },
      receiver: { name: "Іван", phone: "+380671112233", door: { addressID: "ST-1", building: "12А", flat: "5" } },
      places: [{ weight: 1, length: 10, width: 10, height: 10, insurance: 100 }], cod: 0, receiverPays: true, description: "x" }, "C", "S");
    expect(b.receiver).toEqual({ name: "Іван", phone: "+380671112233", service: "Door", addressID: "ST-1", building: "12А", flat: "5" });
  });
});
