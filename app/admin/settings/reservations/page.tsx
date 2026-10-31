import ReservationSettings from '../ReservationSettings';
import { loadSettings } from '../settings-data';
import { requireStaffPage } from '../../../../lib/auth-guard';

export default async function SettingsReservationsPage() {
  // Гейт сторінки: layout пускає admin|manager, а дані тут — лише для admin (аудит 31.10.2026)
  await requireStaffPage('admin');
  const cfg = await loadSettings();

  return <ReservationSettings initialTtlDays={parseInt(cfg.reservation_ttl_days ?? '7', 10)} />;
}
