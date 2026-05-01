import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { CartProvider, useCart } from '../lib/cart';
import type { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => (
  <CartProvider>{children}</CartProvider>
);

const mockItem = {
  sku: 'TEST-001',
  name: 'Test Product',
  brand: 'TestBrand',
  volume: '500ml',
  price: 100,
  min_order: 1,
  nl1: 'white',
  bc: 'bc',
  ac: 'ac',
  img_type: 'tube' as const,
};

describe('useCart', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with empty cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    expect(result.current.items).toHaveLength(0);
    expect(result.current.totalItems).toBe(0);
    expect(result.current.totalPrice).toBe(0);
  });

  it('adds item to cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addItem(mockItem, 2);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].qty).toBe(2);
    expect(result.current.totalItems).toBe(2);
    expect(result.current.totalPrice).toBe(200);
  });

  it('updates quantity of existing item', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addItem(mockItem, 1);
      result.current.addItem(mockItem, 3);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].qty).toBe(4);
  });

  it('removes item from cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addItem(mockItem, 2);
      result.current.removeItem('TEST-001');
    });

    expect(result.current.items).toHaveLength(0);
  });

  it('clears cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addItem(mockItem, 2);
      result.current.clearCart();
    });

    expect(result.current.items).toHaveLength(0);
    expect(result.current.totalPrice).toBe(0);
  });

  it('respects min_order when updating quantity', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addItem({ ...mockItem, min_order: 5 }, 10);
      result.current.updateQty('TEST-001', 2);
    });

    expect(result.current.items[0].qty).toBe(5);
  });
});
