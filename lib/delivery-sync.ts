/**
 * Синк руху посилок переїхав у lib/delivery (DeliveryProvider: контракт
 * перевізника + один конвеєр, 08.11.2026). Цей файл — лише сумісний вхід для
 * крона й кнопки адмінки.
 */
export { syncDeliveryStatuses, SALE_DOC_MISSING_FLAG, type DeliverySyncResult } from './delivery/sync';
