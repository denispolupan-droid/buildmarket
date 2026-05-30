export type ToastType = 'success' | 'error' | 'info' | 'warning';

export function showToast(message: string, type: ToastType = 'info', duration = 3500) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, type, duration } }));
}
