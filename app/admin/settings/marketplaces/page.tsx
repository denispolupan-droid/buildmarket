import MarketplaceSyncSettings from '../MarketplaceSyncSettings';
import { loadSettings } from '../settings-data';

export default async function SettingsMarketplacesPage() {
  const cfg = await loadSettings();

  return <MarketplaceSyncSettings initialMinutes={parseInt(cfg.marketplace_sync_interval_min ?? '15', 10)} />;
}
