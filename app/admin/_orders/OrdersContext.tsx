'use client';

import { createContext, useContext } from 'react';
import type { useAdminOrders } from './useAdminOrders';

// Значення хука журналу для секцій розмітки (_orders/*). Провайдер — у
// AdminOrders; поза ним секції не рендеряться.
export type OrdersCtxValue = ReturnType<typeof useAdminOrders>;
export const OrdersCtx = createContext<OrdersCtxValue | null>(null);

export function useOrdersCtx(): OrdersCtxValue {
  const v = useContext(OrdersCtx);
  if (!v) throw new Error('useOrdersCtx: поза <OrdersCtx.Provider>');
  return v;
}
