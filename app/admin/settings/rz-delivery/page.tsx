import RzDeliverySettings from '../RzDeliverySettings';
import { loadSettings } from '../settings-data';
import { requireStaffPage } from '../../../../lib/auth-guard';

export default async function SettingsRzDeliveryPage() {
  // Гейт сторінки: layout пускає admin|manager, а дані тут — лише для admin (аудит 31.10.2026)
  await requireStaffPage('admin');
  const cfg = await loadSettings();

  return (
    <RzDeliverySettings
      initialToken={cfg.rz_delivery_token ?? ''}
      initialSender={cfg.rz_delivery_sender ?? ''}
      initialBox={cfg.rz_delivery_box ?? ''}
      initialEnabled={cfg.rz_delivery_enabled === 'true'}
    />
  );
}
