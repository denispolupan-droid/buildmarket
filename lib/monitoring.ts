type ErrorContext = {
  user?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

class Monitoring {
  private dsn: string | undefined;

  init(dsn?: string) {
    this.dsn = dsn;
    if (dsn && typeof window !== 'undefined') {
      console.log('[Monitoring] Initialized');
    }
  }

  captureException(error: Error, context?: ErrorContext) {
    console.error('[Monitoring] Error:', error.message, context);

    if (this.dsn && typeof window !== 'undefined') {
      fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          ...context,
          url: window.location.href,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {});
    }
  }

  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
    console.log(`[Monitoring] ${level}:`, message);
  }

  setUser(id: string, email?: string) {
    console.log('[Monitoring] User:', id, email);
  }
}

export const monitoring = new Monitoring();
