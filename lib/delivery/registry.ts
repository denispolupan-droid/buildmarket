import { novaPoshtaProvider } from './providers/nova-poshta';
import { rozetkaPointsProvider } from './providers/rozetka-points';
import { rzDeliveryProvider } from './providers/rz-delivery';
import { manualPostalProvider } from './providers/manual-postal';
import type { DeliveryProvider } from './types';

/**
 * Реєстр перевізників. Порядок має значення: перший, чий handles() каже «так».
 * Нова Пошта — останньою, бо historically невідомі delivery_type вважаються НП.
 */
export const DELIVERY_PROVIDERS: readonly DeliveryProvider[] = [
  rozetkaPointsProvider,
  rzDeliveryProvider,
  manualPostalProvider,
  novaPoshtaProvider,
];

export function providerFor(deliveryType: string | null | undefined): DeliveryProvider {
  return DELIVERY_PROVIDERS.find(p => p.handles(deliveryType)) ?? novaPoshtaProvider;
}
