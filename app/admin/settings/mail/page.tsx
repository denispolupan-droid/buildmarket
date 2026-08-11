import EmailSettings from '../EmailSettings';
import { loadSettings } from '../settings-data';

export default async function SettingsMailPage() {
  const cfg = await loadSettings();

  return (
    <EmailSettings
      initialFromEmail={cfg.orders_from_email        ?? 'orders@fixline.com.ua'}
      initialFromName={cfg.orders_from_name          ?? 'FIXLINE'}
      initialAdminEmail={cfg.admin_email             ?? ''}
      initialContactName={cfg.company_contact_name   ?? ''}
      initialContactPhone={cfg.company_contact_phone ?? ''}
      initialExtraSenders={(() => { try { const p = JSON.parse(cfg.extra_senders ?? '[]'); return Array.isArray(p) ? p : []; } catch { return []; } })()}
      initialDefaultSender={cfg.orders_default_sender ?? ''}
      initialSignatures={(() => { try { const p = JSON.parse(cfg.mail_signatures ?? '{}'); return p && typeof p === 'object' && !Array.isArray(p) ? p as Record<string, string> : {}; } catch { return {}; } })()}
    />
  );
}
