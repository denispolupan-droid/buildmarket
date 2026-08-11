import RzDeliverySettings from '../RzDeliverySettings';
import { loadSettings } from '../settings-data';

export default async function SettingsRzDeliveryPage() {
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
