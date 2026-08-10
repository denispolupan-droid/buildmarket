import { describe, it, expect } from 'vitest';
import {
  pickReturnTtn, returnPlace, buildReturnTracking, storageDaysLeft, returnTrackingLabel,
} from '../lib/np-return-tracking';

// Обидва документи — реальні відповіді НП по замовленню #26071048 (10.08.2026).
const outbound = {
  Number: '20451496976628',
  Status: 'Відмова від отримання',
  StatusCode: '102',
  CityRecipient: 'Київ',
  WarehouseRecipient: 'Відділення №455 (до 30 кг): просп. Лобановського, 126А',
  LastCreatedOnTheBasisNumber: '59001733305142',
  LastCreatedOnTheBasisDocumentType: 'CargoReturn',
};

const inbound = {
  Number: '59001733305142',
  Status: 'Прибув у відділення',
  StatusCode: '7',
  CityRecipient: 'Харків',
  WarehouseRecipient: 'Відділення №27 (до 200 кг на одне місце): вул. Шевченка, 317',
  ActualDeliveryDate: '2026-08-10 17:39:37',
  DatePayedKeeping: '2026-08-18 17:39:37',
};

describe('pickReturnTtn', () => {
  it('бере номер зворотної накладної', () => {
    expect(pickReturnTtn(outbound)).toBe('59001733305142');
  });

  it('накладна іншого типу за повернення не видається', () => {
    // На підставі створюють не лише повернення (буває переадресація) — показати
    // чужий номер як «повернення» гірше, ніж не показати нічого.
    expect(pickReturnTtn({ ...outbound, LastCreatedOnTheBasisDocumentType: 'Redirecting' })).toBeNull();
    expect(pickReturnTtn({ Number: '1' })).toBeNull();
  });
});

describe('returnPlace', () => {
  it('місто і номер відділення без службового хвоста', () => {
    expect(returnPlace(inbound)).toBe('Харків, Відділення №27');
  });

  it('коли місця немає — null, а не порожній рядок', () => {
    expect(returnPlace({ Number: '1' })).toBeNull();
  });
});

describe('buildReturnTracking', () => {
  it('складає стан зворотної посилки', () => {
    const t = buildReturnTracking(inbound, '2026-08-10T18:00:00Z')!;
    expect(t).toMatchObject({
      ttn: '59001733305142',
      status: 'Прибув у відділення',
      place: 'Харків, Відділення №27',
      arrivedAt: '2026-08-10 17:39:37',
      storageUntil: '2026-08-18 17:39:37',
    });
  });

  it('поки посилка в дорозі — часу прибуття немає', () => {
    const t = buildReturnTracking({ ...inbound, StatusCode: '5', Status: 'Прямує до міста' }, '2026-08-10T18:00:00Z')!;
    expect(t.arrivedAt).toBeNull();
  });
});

describe('storageDaysLeft / returnTrackingLabel', () => {
  const t = buildReturnTracking(inbound, '2026-08-10T18:00:00Z')!;

  it('рахує дні до платного зберігання', () => {
    expect(storageDaysLeft(t, new Date('2026-08-10T18:00:00'))).toBe(8);
    expect(storageDaysLeft(t, new Date('2026-08-18T10:00:00'))).toBe(1);
  });

  it('після дати зберігання стає платним — від\'ємне число', () => {
    expect(storageDaysLeft(t, new Date('2026-08-20T10:00:00'))).toBeLessThan(0);
  });

  it('рядок для картки читається як відповідь на «де посилка»', () => {
    expect(returnTrackingLabel(t, new Date('2026-08-10T18:00:00')))
      .toBe('Прибув у відділення · Харків, Відділення №27 · безкоштовне зберігання до 18.08');
    expect(returnTrackingLabel(t, new Date('2026-08-20T10:00:00')))
      .toContain('платне зберігання з 18.08');
  });

  it('без дати зберігання рядок не бреше про терміни', () => {
    const inTransit = buildReturnTracking({ Number: '1', Status: 'Прямує до міста', StatusCode: '5', CityRecipient: 'Харків' }, 'x')!;
    expect(storageDaysLeft(inTransit, new Date())).toBeNull();
    expect(returnTrackingLabel(inTransit, new Date())).toBe('Прямує до міста · Харків');
  });
});
