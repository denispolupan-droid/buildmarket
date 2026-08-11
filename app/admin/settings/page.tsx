import NpSenderSettings from './NpSenderSettings';
import { loadSettings } from './settings-data';

export default async function SettingsNpPage() {
  const cfg = await loadSettings();

  return (
    <NpSenderSettings
      initialApiKey={cfg.np_api_key ?? ''}
      initialCityRef={cfg.np_sender_city_ref ?? (process.env.NP_SENDER_CITY_REF ?? '')}
      initialCityName={cfg.np_sender_city_name ?? ''}
      initialSenderType={(cfg.np_sender_type as 'warehouse' | 'address') ?? 'warehouse'}
      initialWarehouseRef={cfg.np_sender_warehouse_ref ?? (process.env.NP_SENDER_WAREHOUSE_REF ?? '')}
      initialWarehouseDesc={cfg.np_sender_warehouse_desc ?? ''}
      initialAddressRef={cfg.np_sender_address_ref ?? ''}
      initialAddressDesc={cfg.np_sender_address_desc ?? ''}
    />
  );
}
