import DemandClient from './DemandClient';
import HiddenDemand from './HiddenDemand';
import HelpBox from '../HelpBox';
import { HELP_DEMAND } from '../help-content';
import { requireStaffPage } from '../../../../lib/auth-guard';

export const dynamic = 'force-dynamic';

export default async function SeoDemandPage() {
  // Гейт сторінки: layout пускає admin|manager, а дані тут — лише для admin (аудит 31.10.2026)
  await requireStaffPage('admin');
  return (
    <>
      <HelpBox content={HELP_DEMAND} />
      <DemandClient />
      <HiddenDemand />
    </>
  );
}
