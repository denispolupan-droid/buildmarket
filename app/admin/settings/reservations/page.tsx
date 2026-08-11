import ReservationSettings from '../ReservationSettings';
import { loadSettings } from '../settings-data';

export default async function SettingsReservationsPage() {
  const cfg = await loadSettings();

  return <ReservationSettings initialTtlDays={parseInt(cfg.reservation_ttl_days ?? '7', 10)} />;
}
