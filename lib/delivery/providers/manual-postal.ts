import { isManualPostalCarrier } from '../../carriers';
import type { DeliveryProvider } from '../types';

/**
 * Укрпошта й Meest (з маркетплейсів): API перевізника в нас немає, накладні
 * оформлюються в кабінеті площадки, вручення підтверджує синк площадки або
 * менеджер кнопкою. Провайдер існує, щоб конвеєр не плутав їх із Новою Поштою
 * (інцидент 02.11.2026: їхні номери йшли в трекінг НП як «не знайдено»).
 */
export const manualPostalProvider: DeliveryProvider = {
  code: 'manual',
  label: 'Укрпошта / Meest (вручну)',
  handles: t => isManualPostalCarrier(t),
  notifiesParcelEvents: false,
  async track() { return new Map(); },
};
