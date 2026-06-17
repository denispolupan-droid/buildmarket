export function showConfirm(message: string, options?: { confirmLabel?: string; cancelLabel?: string }): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  return new Promise(resolve => {
    window.dispatchEvent(new CustomEvent('show-confirm', {
      detail: { message, resolve, ...options },
    }));
  });
}
