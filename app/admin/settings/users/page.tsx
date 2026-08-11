import UsersSettings from '../UsersSettings';
import { loadSettings } from '../settings-data';

export default async function SettingsUsersPage() {
  await loadSettings(); // гард на права; власні дані компонент тягне сам
  return <UsersSettings />;
}
