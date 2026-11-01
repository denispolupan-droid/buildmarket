import UsersSettings from '../UsersSettings';
import B2BRequests from '../B2BRequests';
import { loadSettings } from '../settings-data';
import { requireStaffPage } from '../../../../lib/auth-guard';

export default async function SettingsUsersPage() {
  // Гейт сторінки: layout пускає admin|manager, а дані тут — лише для admin (аудит 31.10.2026)
  await requireStaffPage('admin');
  await loadSettings(); // гард на права; власні дані компонент тягне сам
  return (
    <>
      <B2BRequests />
      <UsersSettings />
    </>
  );
}
