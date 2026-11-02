'use client';

import type { ButtonHTMLAttributes } from 'react';

/**
 * Кнопка адмінки — обгортка над наявними класами .proc-btn (globals.css):
 * default — контурна, primary — #1E3A5F, danger, accent, done, ghost; size="sm" — 28px.
 * type за замовчуванням "button", щоб кнопка в <form> не відправляла її випадково.
 */
export type ButtonVariant = 'default' | 'primary' | 'danger' | 'accent' | 'done' | 'ghost';

export function Button({ variant = 'default', size, className, type = 'button', ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' }) {
  const cls = ['proc-btn', variant !== 'default' && variant, size === 'sm' && 'sm', className].filter(Boolean).join(' ');
  return <button type={type} className={cls} {...rest} />;
}
