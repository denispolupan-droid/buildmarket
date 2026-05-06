type ErrorContext = {
  user?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

class Monitoring {
  captureException(error: Error, context?: ErrorContext) {
    console.error('[Error]', error.message, context);
    // Server-side: send email alert via Resend
    if (typeof window === 'undefined') {
      this.sendAlert(error.message, error.stack, context).catch(() => {});
    }
  }

  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
    if (level === 'error') console.error('[Error]', message);
    else console.log(`[${level}]`, message);
  }

  private async sendAlert(message: string, stack?: string, context?: ErrorContext) {
    const apiKey = process.env.RESEND_API_KEY;
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!apiKey || !adminEmail) return;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'FIXLINE System <noreply@fixline.com.ua>',
        to: adminEmail,
        subject: `⚠️ Помилка на сайті: ${message.slice(0, 60)}`,
        html: `<pre style="font-family:monospace;font-size:13px">
<b>Помилка:</b> ${message}

<b>Контекст:</b> ${JSON.stringify(context ?? {}, null, 2)}

<b>Stack:</b>
${stack ?? '—'}

<b>Час:</b> ${new Date().toISOString()}
        </pre>`,
      }),
    });
  }
}

export const monitoring = new Monitoring();
