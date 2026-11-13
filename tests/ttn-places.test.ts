import { describe, it, expect } from 'vitest';
import { ttnPlaces, placesLabel } from '../lib/ttn-snapshot';

describe('ttnPlaces — місця в ЕН для листа постачальнику', () => {
  it('за знімком саме цього номера', () => {
    expect(ttnPlaces({ ttn: '2045', places: 5 }, '2045')).toBe(5);
    expect(ttnPlaces({ ttn: '2045', places: 1, seats: [{}, {}, {}] }, '2045')).toBe(3);
  });
  it('чужий знімок (номер замінили), без знімка, одне місце — 1', () => {
    expect(ttnPlaces({ ttn: '2045', places: 5 }, '9999')).toBe(1);
    expect(ttnPlaces(null, '2045')).toBe(1);
    expect(ttnPlaces({ ttn: '2045', places: 1 }, '2045')).toBe(1);
    expect(ttnPlaces({ ttn: '2045' }, '2045')).toBe(1);
  });
});

describe('placesLabel', () => {
  it('відмінки', () => {
    expect(placesLabel(2)).toBe('2 місця');
    expect(placesLabel(5)).toBe('5 місць');
    expect(placesLabel(11)).toBe('11 місць');
    expect(placesLabel(21)).toBe('21 місце');
    expect(placesLabel(24)).toBe('24 місця');
    expect(placesLabel(14)).toBe('14 місць');
  });
});
